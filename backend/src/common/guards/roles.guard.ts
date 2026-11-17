import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/auth.decorators';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Coarse role check. Resource-ownership checks happen inside services, never only here. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const roles = request.user?.roles ?? [];
    if (required.some((r) => roles.includes(r))) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
