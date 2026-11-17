import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type Mock = jest.Mock;

function buildPrisma() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    uuid: '11111111-1111-4111-8111-111111111111',
    email: 'buyer@example.com',
    passwordHash: 'hash',
    status: 'ACTIVE',
    locale: 'ka',
    displayCurrency: 'GEL',
    emailVerifiedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
    deletedAt: null,
    roles: [{ role: { key: 'buyer' } }],
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let passwords: { verify: Mock; verifyDummy: Mock; hash: Mock; needsRehash: Mock };
  let audit: { log: Mock };
  let service: AuthService;
  const tokens = new TokenService();
  const ctx = { ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    prisma = buildPrisma();
    passwords = {
      verify: jest.fn(),
      verifyDummy: jest.fn().mockResolvedValue(undefined),
      hash: jest.fn().mockResolvedValue('newhash'),
      needsRehash: jest.fn().mockReturnValue(false),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const config = {
      getOrThrow: (key: string) =>
        ({ JWT_ACCESS_TTL_SECONDS: 900, JWT_ACCESS_SECRET: 'x'.repeat(32), REFRESH_TOKEN_TTL_DAYS: 30, APP_BASE_URL: 'http://x' })[
          key
        ],
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt.token') };
    service = new AuthService(
      prisma as never,
      passwords as unknown as PasswordService,
      tokens,
      jwt as never,
      config as never,
      audit as never,
    );
    prisma.refreshToken.create.mockResolvedValue({ id: 99n });
  });

  describe('login', () => {
    it('rejects unknown emails with a generic error and still spends hashing time', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@example.com', password: 'pw' }, ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwords.verifyDummy).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong password and counts the failure', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ failedLoginCount: 1 }));
      passwords.verify.mockResolvedValue(false);
      await expect(service.login({ email: 'buyer@example.com', password: 'bad' }, ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 2 }) }),
      );
    });

    it('locks the account on the fifth consecutive failure', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ failedLoginCount: 4 }));
      passwords.verify.mockResolvedValue(false);
      await expect(service.login({ email: 'buyer@example.com', password: 'bad' }, ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      const data = (prisma.user.update.mock.calls[0][0] as { data: { lockedUntil: Date } }).data;
      expect(data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.account_locked' }));
    });

    it('refuses a locked account even with the right password', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ lockedUntil: new Date(Date.now() + 60_000) }));
      await expect(service.login({ email: 'buyer@example.com', password: 'right' }, ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwords.verify).not.toHaveBeenCalled();
    });

    it('returns a session and never puts the refresh token hash in the response', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      passwords.verify.mockResolvedValue(true);
      const session = await service.login({ email: 'buyer@example.com', password: 'right' }, ctx);
      expect(session.accessToken).toBe('access.jwt.token');
      expect(session.user.roles).toEqual(['buyer']);
      expect(session.refreshToken.length).toBeGreaterThanOrEqual(43);
      const stored = (prisma.refreshToken.create.mock.calls[0][0] as { data: { tokenHash: string } }).data;
      expect(stored.tokenHash).toBe(tokens.hash(session.refreshToken));
    });
  });

  describe('refresh', () => {
    const baseToken = (overrides: Record<string, unknown> = {}) => ({
      id: 5n,
      userId: 1n,
      familyId: 'fam-1',
      revokedAt: null,
      replacedById: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      user: buildUser(),
      ...overrides,
    });

    it('rejects a missing token', async () => {
      await expect(service.refresh(undefined, ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('nope', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rotates a valid token within the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(baseToken());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      const session = await service.refresh('raw', ctx);
      expect(session.accessToken).toBe('access.jwt.token');
      const created = (prisma.refreshToken.create.mock.calls[0][0] as { data: { familyId: string } }).data;
      expect(created.familyId).toBe('fam-1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 5n }, data: { replacedById: 99n } });
    });

    it('revokes the whole family when an old token is replayed after the grace window', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        baseToken({ revokedAt: new Date(Date.now() - 60_000), replacedById: 7n }),
      );
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      await expect(service.refresh('raw', ctx)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'fam-1', revokedAt: null } }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.refresh_reuse_detected' }));
    });

    it('does not revoke the family for a near-simultaneous duplicate request', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        baseToken({ revokedAt: new Date(Date.now() - 2_000), replacedById: 7n }),
      );
      await expect(service.refresh('raw', ctx)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(baseToken({ expiresAt: new Date(Date.now() - 1) }));
      await expect(service.refresh('raw', ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when a concurrent request already claimed the token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(baseToken());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.refresh('raw', ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
