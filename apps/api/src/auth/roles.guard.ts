import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RolApp } from '../db/contexto';
import { CLAVE_PUBLICO, CLAVE_ROLES } from './decoradores';
import type { UsuarioActual } from './tipos';

/**
 * Corre después de JwtGuard. Si la ruta declara @Roles(), el rol del token debe
 * estar en la lista. Rutas sin @Roles() y no públicas: cualquier usuario autenticado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<RolApp[]>(
      CLAVE_ROLES,
      objetivos,
    );
    if (!roles?.length) return true;
    const { usuario } = ctx
      .switchToHttp()
      .getRequest<Request & { usuario: UsuarioActual }>();
    if (!roles.includes(usuario.rol)) {
      throw new ForbiddenException('Tu rol no tiene acceso a esta operación');
    }
    return true;
  }
}
