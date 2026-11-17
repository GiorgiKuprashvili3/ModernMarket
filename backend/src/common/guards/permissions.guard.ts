import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Fine-grained admin permissions (e.g. `sellers.approve`). Permissions are read from the database on
 * each protected request rather than baked into the token, so revoking a permission takes effect
 * immediately instead of when the access token expires.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException('Authentication required');

    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { user: { uuid: user.uuid, status: 'ACTIVE', deletedAt: null } } } } },
      select: { permission: { select: { key: true } } },
    });
    const granted = new Set(rows.map((r) => r.permission.key));
    if (required.every((p) => granted.has(p))) return true;
    throw new ForbiddenException('Missing permission');
  }
}
