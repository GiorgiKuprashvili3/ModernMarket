import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

export interface PublicUser {
  uuid: string;
  email: string;
  roles: string[];
  locale: string;
  displayCurrency: string;
  emailVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: { include: { role: true } } } }>;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// A second refresh using a just-rotated token (e.g. two browser tabs) is not treated as theft.
const REFRESH_REUSE_GRACE_MS = 10_000;
const VERIFY_TOKEN_TTL_HOURS = 48;
const RESET_TOKEN_TTL_HOURS = 1;

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Registration

  /**
   * Always resolves the same way whether or not the email is already registered, so the endpoint
   * cannot be used to discover which emails have accounts. An existing account gets an
   * "account exists" email instead of a verification email.
   */
  async register(dto: RegisterDto, ctx: ClientContext): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      await this.prisma.emailOutbox.create({
        data: { toEmail: existing.email, template: 'account-exists', locale: existing.locale, payload: {} },
      });
      return;
    }

    const buyerRole = await this.prisma.role.findUnique({ where: { key: 'buyer' } });
    if (!buyerRole) {
      // Seed data missing: a deployment problem, not a user error.
      this.logger.error('Role "buyer" not found. Run the database seed.');
      throw new Error('Role configuration missing');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const rawToken = this.tokens.generate();

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            locale: dto.locale ?? 'ka',
            roles: { create: { roleId: buyerRole.id } },
            buyerProfile: {
              create: { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
            },
          },
        });
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: this.tokens.hash(rawToken),
            expiresAt: this.hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
          },
        });
        // The raw token has to reach the user by email, so it sits in the outbox payload until sent.
        // TODO(M2): the email worker must clear `payload` once the email has been sent.
        await tx.emailOutbox.create({
          data: {
            toEmail: user.email,
            template: 'verify-email',
            locale: user.locale,
            payload: { firstName: dto.firstName, link: this.appLink('/auth/verify-email', rawToken) },
          },
        });
        await this.audit.log(
          {
            actorId: user.id,
            actorRole: 'buyer',
            action: 'auth.register',
            entityType: 'user',
            entityId: user.uuid,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          tx,
        );
      });
    } catch (error) {
      // Lost a race with another registration for the same email: behave as "already exists".
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }

  // ------------------------------------------------------------------ Login / sessions

  async login(dto: LoginDto, ctx: ClientContext): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });

    const now = new Date();
    if (!user || user.deletedAt || (user.lockedUntil && user.lockedUntil > now)) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await this.passwords.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.recordFailedLogin(user.id, user.uuid, user.failedLoginCount, ctx);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status === 'BLOCKED') {
      throw new ForbiddenException('This account is blocked');
    }

    const data: Prisma.UserUpdateInput = { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now };
    if (this.passwords.needsRehash(user.passwordHash)) {
      data.passwordHash = await this.passwords.hash(dto.password);
    }
    await this.prisma.user.update({ where: { id: user.id }, data });

    return this.issueSession(user, ctx, this.tokens.newFamilyId());
  }

  /** Rotates the refresh token. Presenting an already-rotated token revokes the whole family. */
  async refresh(rawToken: string | undefined, ctx: ClientContext): Promise<AuthSession> {
    if (!rawToken) throw new UnauthorizedException('Missing refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hash(rawToken) },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    const now = new Date();

    if (stored.revokedAt) {
      const sinceRevoked = now.getTime() - stored.revokedAt.getTime();
      if (stored.replacedById !== null && sinceRevoked < REFRESH_REUSE_GRACE_MS) {
        // Almost certainly a concurrent request; the client already holds the newer token.
        throw new UnauthorizedException('Refresh token already used');
      }
      // Reuse of an old token: assume theft and end every session in this family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.log({
        actorId: stored.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'user',
        entityId: stored.user.uuid,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt <= now) throw new UnauthorizedException('Refresh token expired');
    if (stored.user.deletedAt || stored.user.status === 'BLOCKED') {
      throw new UnauthorizedException('Account unavailable');
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent request can flip revokedAt from null.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) throw new UnauthorizedException('Refresh token already used');

      const session = await this.issueSession(stored.user, ctx, stored.familyId, tx);
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replacedById: session.newTokenId },
      });
      return session.session;
    });
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.tokens.hash(rawToken) } });
    if (!stored) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(uuid: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { uuid },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    return this.toPublicUser(user);
  }

  // ------------------------------------------------------------------ Email verification

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.tokens.hash(dto.token) },
    });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw new BadRequestException('Verification link is invalid or has expired');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException('Verification link is invalid or has expired');
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now, status: 'ACTIVE' },
      });
    });
  }

  // ------------------------------------------------------------------ Password reset

  /** Always resolves silently so the response does not reveal whether the email exists. */
  async forgotPassword(dto: ForgotPasswordDto, ctx: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.deletedAt) return;

    const rawToken = this.tokens.generate();
    await this.prisma.$transaction(async (tx) => {
      // Invalidate earlier unused reset links.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.tokens.hash(rawToken),
          expiresAt: this.hoursFromNow(RESET_TOKEN_TTL_HOURS),
        },
      });
      await tx.emailOutbox.create({
        data: {
          toEmail: user.email,
          template: 'reset-password',
          locale: user.locale,
          payload: { link: this.appLink('/auth/reset-password', rawToken) },
        },
      });
      await this.audit.log(
        {
          actorId: user.id,
          action: 'auth.password_reset_requested',
          entityType: 'user',
          entityId: user.uuid,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });
  }

  async resetPassword(dto: ResetPasswordDto, ctx: ClientContext): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.tokens.hash(dto.token) },
      include: { user: true },
    });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException('Reset link is invalid or has expired');

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      // Every existing session ends when the password changes.
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.log(
        {
          actorId: record.userId,
          action: 'auth.password_reset_completed',
          entityType: 'user',
          entityId: record.user.uuid,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        tx,
      );
    });
  }

  // ------------------------------------------------------------------ Internals

  private async recordFailedLogin(
    userId: bigint,
    userUuid: string,
    currentCount: number,
    ctx: ClientContext,
  ): Promise<void> {
    const count = currentCount + 1;
    const lock = count >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    if (lock) {
      await this.audit.log({
        actorId: userId,
        action: 'auth.account_locked',
        entityType: 'user',
        entityId: userUuid,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
  }

  private async issueSession(user: UserWithRoles, ctx: ClientContext, familyId: string): Promise<AuthSession>;
  private async issueSession(
    user: UserWithRoles,
    ctx: ClientContext,
    familyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ session: AuthSession; newTokenId: bigint }>;
  private async issueSession(
    user: UserWithRoles,
    ctx: ClientContext,
    familyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthSession | { session: AuthSession; newTokenId: bigint }> {
    const client = tx ?? this.prisma;
    const publicUser = this.toPublicUser(user);
    const ttlSeconds = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const payload: AccessTokenPayload = { sub: user.uuid, roles: publicUser.roles };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: ttlSeconds,
    });

    const refreshToken = this.tokens.generate();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    const row = await client.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.tokens.hash(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: ctx.ip?.slice(0, 45),
        userAgent: ctx.userAgent?.slice(0, 255),
      },
    });

    const session: AuthSession = { accessToken, expiresIn: ttlSeconds, refreshToken, refreshExpiresAt, user: publicUser };
    return tx ? { session, newTokenId: row.id } : session;
  }

  private toPublicUser(user: UserWithRoles): PublicUser {
    return {
      uuid: user.uuid,
      email: user.email,
      roles: user.roles.map((r) => r.role.key),
      locale: user.locale,
      displayCurrency: user.displayCurrency,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  private hoursFromNow(hours: number): Date {
    return new Date(Date.now() + hours * 3_600_000);
  }

  private appLink(path: string, token: string): string {
    const base = this.config.getOrThrow<string>('APP_BASE_URL').replace(/\/$/, '');
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }
}
