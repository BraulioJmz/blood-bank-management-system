import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DbService } from '../db/db.service';
import { RolApp } from '../db/contexto';
import { PayloadJwt } from './tipos';

interface Credenciales {
  id_usuario: number;
  nombre: string;
  password_hash: string;
  rol: RolApp;
  id_hospital: number | null;
}

// Hash señuelo: si el usuario no existe, igual se ejecuta argon2.verify para que el
// tiempo de respuesta no revele qué nombres de usuario existen.
const HASH_SENUELO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudWVsb3NlbnVlbG8$0Ng2wPZQ6c0Gh0GgpcZ6x9i6l3bH1oP8l7pQkzQm8E8';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    // fn_credenciales_login es SECURITY DEFINER y la única puerta de app_login a
    // la tabla usuario: devuelve solo al usuario pedido y solo si está activo.
    const { rows } = await this.db.pool.query<Credenciales>(
      'SELECT id_usuario, nombre, password_hash, rol, id_hospital FROM banco.fn_credenciales_login($1)',
      [username],
    );
    const u = rows[0];
    const valido = await argon2
      .verify(u?.password_hash ?? HASH_SENUELO, password)
      .catch(() => false);
    if (!u || !valido) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    const payload: PayloadJwt = {
      sub: u.id_usuario,
      rol: u.rol,
      id_hospital: u.id_hospital,
      nombre: u.nombre,
      username: username.toLowerCase(),
    };
    return {
      token: await this.jwt.signAsync(payload),
      usuario: {
        idUsuario: u.id_usuario,
        nombre: u.nombre,
        rol: u.rol,
        idHospital: u.id_hospital,
        username: payload.username,
      },
    };
  }
}
