import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ROLES_APP } from '../db/contexto';
import { CLAVE_PUBLICO } from './decoradores';
import type { PayloadJwt, UsuarioActual } from './tipos';

/** Guard global: toda ruta exige un Bearer válido salvo las marcadas @Publico(). */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publico) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioActual }>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    let p: PayloadJwt;
    try {
      p = await this.jwt.verifyAsync<PayloadJwt>(token);
    } catch {
      throw new UnauthorizedException(
        'Tu sesión expiró; vuelve a iniciar sesión',
      );
    }
    if (!(ROLES_APP as readonly string[]).includes(p.rol)) {
      throw new UnauthorizedException('Token con rol desconocido');
    }
    req.usuario = {
      idUsuario: p.sub,
      rol: p.rol,
      idHospital: p.id_hospital,
      nombre: p.nombre,
      username: p.username,
    };
    return true;
  }
}
