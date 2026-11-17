import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,32}$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsIn(['ka', 'en'])
  locale?: 'ka' | 'en';

  @IsBoolean()
  @Equals(true, { message: 'Terms and privacy policy must be accepted' })
  acceptTerms: boolean;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class ForgotPasswordDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 128)
  token: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}

export class VerifyEmailDto {
  @IsString()
  @Length(20, 128)
  token: string;
}
