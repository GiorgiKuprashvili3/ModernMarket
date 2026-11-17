import { SellerType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitSellerApplicationDto {
  @IsEnum(SellerType)
  sellerType: SellerType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName: string;

  // Georgian identification: 11 digits for a person or sole proprietor, 9 digits for a legal entity.
  // The service additionally requires 11 digits for INDIVIDUAL sellers.
  @Matches(/^(\d{9}|\d{11})$/, { message: 'identificationNumber must be 9 or 11 digits' })
  identificationNumber: string;

  @Matches(/^\+?[0-9 ()-]{6,32}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  contactAddress: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  storeName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  storeDescription?: string;
}

export class RejectApplicationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class ListApplicationsQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
