import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RolApp } from '../db/contexto';
import type { UsuarioActual } from './tipos';

export const CLAVE_PUBLICO = 'esPublico';
export const CLAVE_ROLES = 'roles';

/** Ruta sin autenticación (login, salud). */
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

/** Roles de la app que pueden usar el endpoint (defensa en profundidad: la BD vuelve a validar). */
export const Roles = (...roles: RolApp[]) => SetMetadata(CLAVE_ROLES, roles);

/** Inyecta el usuario autenticado (para pasarlo a DbService.withContext). */
export const Usuario = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioActual =>
    ctx.switchToHttp().getRequest<Request & { usuario: UsuarioActual }>()
      .usuario,
);
