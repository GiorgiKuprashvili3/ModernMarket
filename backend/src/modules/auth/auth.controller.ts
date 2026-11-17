import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService, AuthSession, ClientContext, PublicUser } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';

const REFRESH_COOKIE = 'mm_rt';
const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'modernmarket';

interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ message: string }> {
    await this.auth.register(dto, this.context(req));
    // Identical response whether or not the email already had an account.
    return { message: 'If the email can be registered, a confirmation message has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.login(dto, this.context(req));
    return this.respondWithSession(res, session);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    this.assertSameSiteRequest(req);
    const session = await this.auth.refresh(this.readRefreshCookie(req), this.context(req));
    return this.respondWithSession(res, session);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameSiteRequest(req);
    await this.auth.logout(this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto, this.context(req));
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    await this.auth.resetPassword(dto, this.context(req));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.auth.me(user.uuid);
  }

  // ------------------------------------------------------------------ helpers

  private respondWithSession(res: Response, session: AuthSession): SessionResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshExpiresAt,
    });
    // The refresh token is only ever in the HttpOnly cookie, never in the response body.
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }

  private cookieOptions(): CookieOptions {
    const prefix = this.config.getOrThrow<string>('API_PREFIX');
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'strict',
      // The cookie is only sent to the auth endpoints.
      path: `/${prefix}/auth`,
    };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  /**
   * CSRF defense for the two cookie-authenticated endpoints: SameSite=Strict plus a custom header
   * that cross-site forms cannot set, plus an Origin allow-list check when the browser sends one.
   */
  private assertSameSiteRequest(req: Request): void {
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new ForbiddenException('Missing request header');
    }
    const origin = req.headers.origin;
    if (origin) {
      const allowed = this.config
        .getOrThrow<string>('CORS_ORIGINS')
        .split(',')
        .map((o) => o.trim());
      if (!allowed.includes(origin)) throw new ForbiddenException('Origin not allowed');
    }
  }

  private context(req: Request): ClientContext {
    const ua = req.headers['user-agent'];
    return { ip: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
  }
}
