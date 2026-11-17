import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  // Kept as a string on purpose: implicit conversion would turn the text "false" into boolean true.
  @IsIn(['true', 'false'])
  COOKIE_SECURE: string = 'false';

  // Base URL of the frontend, used to build links in emails (verify email, reset password).
  @IsString()
  @IsNotEmpty()
  APP_BASE_URL: string = 'http://localhost:4200';

  // 32 random bytes, base64 (e.g. `openssl rand -base64 32`). Encrypts sensitive fields such as
  // seller identification numbers. Losing this key makes those values unrecoverable.
  @IsString()
  @IsNotEmpty()
  DATA_ENCRYPTION_KEY: string;

  // Set to 'false' to run the API without background workers (e.g. email sending).
  @IsIn(['true', 'false'])
  WORKERS_ENABLED: string = 'true';

  @IsString()
  @IsOptional()
  MAIL_TRANSPORT?: string;

  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS: number = 30;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  if (Buffer.from(validated.DATA_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('Invalid environment configuration: DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  }
  if (validated.NODE_ENV === 'production' && validated.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
  }
  return validated;
}
