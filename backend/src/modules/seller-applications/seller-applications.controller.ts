import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { ClientContext } from '../auth/auth.service';
import { ListApplicationsQueryDto, RejectApplicationDto, SubmitSellerApplicationDto } from './dto/seller-application.dto';
import { SellerApplicationsService } from './seller-applications.service';

function context(req: Request): ClientContext {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
}

/** Applicant-facing endpoints: any signed-in buyer may apply. */
@ApiTags('seller-applications')
@ApiBearerAuth()
@Roles('buyer')
@Controller('seller-applications')
export class SellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post()
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitSellerApplicationDto, @Req() req: Request) {
    return this.service.submit(user.uuid, dto, context(req));
  }

  @Get('me')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.mine(user.uuid);
  }
}

/** Administrator endpoints: role AND the matching permission are both required. */
@ApiTags('admin / seller-applications')
@ApiBearerAuth()
@Roles('admin', 'super_admin')
@Controller('admin/seller-applications')
export class AdminSellerApplicationsController {
  constructor(private readonly service: SellerApplicationsService) {}

  @RequirePermissions('sellers.read')
  @Get()
  list(@Query() query: ListApplicationsQueryDto) {
    return this.service.list(query);
  }

  @RequirePermissions('sellers.read')
  @Get(':uuid')
  detail(@CurrentUser() admin: AuthenticatedUser, @Param('uuid', ParseUUIDPipe) uuid: string, @Req() req: Request) {
    return this.service.detail(admin.uuid, uuid, context(req));
  }

  @RequirePermissions('sellers.approve')
  @Post(':uuid/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async review(@CurrentUser() admin: AuthenticatedUser, @Param('uuid', ParseUUIDPipe) uuid: string, @Req() req: Request) {
    await this.service.markUnderReview(admin.uuid, uuid, context(req));
  }

  @RequirePermissions('sellers.approve')
  @Post(':uuid/approve')
  approve(@CurrentUser() admin: AuthenticatedUser, @Param('uuid', ParseUUIDPipe) uuid: string, @Req() req: Request) {
    return this.service.approve(admin.uuid, uuid, context(req));
  }

  @RequirePermissions('sellers.approve')
  @Post(':uuid/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: RejectApplicationDto,
    @Req() req: Request,
  ) {
    await this.service.reject(admin.uuid, uuid, dto.reason, context(req));
  }
}
