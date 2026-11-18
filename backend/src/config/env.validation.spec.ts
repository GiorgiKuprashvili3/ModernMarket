import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { validateEnv } from './env.validation';

const base = () => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'mysql://u:p@localhost:3306/db',
  CORS_ORIGINS: 'http://localhost:4200',
  JWT_ACCESS_SECRET: 'a-development-secret',
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
});

describe('validateEnv', () => {
  it('accepts a minimal valid configuration and applies defaults', () => {
    const env = validateEnv(base());
    expect(env.API_PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
  });

  it('keeps COOKIE_SECURE=false as the text "false" (not boolean true)', () => {
    expect(validateEnv({ ...base(), COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe('false');
  });

  it('rejects a missing required variable', () => {
    const rest: Record<string, unknown> = base();
    delete rest['DATABASE_URL'];
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() => validateEnv({ ...base(), DATA_ENCRYPTION_KEY: randomBytes(16).toString('base64') })).toThrow(
      /32 bytes/,
    );
  });

  it('requires a long JWT secret in production', () => {
    expect(() => validateEnv({ ...base(), NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });
});
