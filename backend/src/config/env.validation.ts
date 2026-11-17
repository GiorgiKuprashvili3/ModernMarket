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
  if (validated.NODE_ENV === 'production' && validated.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
  }
  return validated;
}
