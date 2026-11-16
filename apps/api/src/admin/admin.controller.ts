import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import * as argon2 from 'argon2';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila, PaginacionDto, paginado } from '../common/paginacion';
import { ROLES_APP } from '../db/contexto';
import { DbService } from '../db/db.service';

class BitacoraDto extends PaginacionDto {
  @IsOptional() @IsString() @Length(1, 63) tabla?: string;
  @IsOptional() @IsIn(['INSERT', 'UPDATE', 'DELETE']) operacion?: string;
  @IsOptional() @IsString() @Length(1, 63) rol_app?: string;
  @IsOptional() @Type(() => Number) @IsInt() id_registro?: number;
  @IsOptional() @IsISO8601() desde?: string;
  @IsOptional() @IsISO8601() hasta?: string;
}

const PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).{8,100}$/;

class CrearUsuarioDto {
  @Matches(/^[a-z0-9._]{3,50}$/, {
    message: 'Usuario: 3–50 minúsculas, dígitos, punto o guion bajo',
  })
  username!: string;
  @IsString() @Length(3, 150) nombre!: string;
  @Matches(PASSWORD, {
    message: 'La contraseña necesita 8+ caracteres con letras y números',
  })
  password!: string;
  @IsIn(ROLES_APP) rol!: string;
  @IsOptional() @IsInt() id_hospital?: number | null;
}

class ActualizarUsuarioDto {
  @IsOptional() @IsString() @Length(3, 150) nombre?: string;
  @IsOptional()
  @Matches(PASSWORD, {
    message: 'La contraseña necesita 8+ caracteres con letras y números',
  })
  password?: string;
  @IsOptional() @IsIn(ROLES_APP) rol?: string;
  @IsOptional() @IsInt() id_hospital?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly db: DbService) {}

  /** Bitácora de solo lectura (ningún rol tiene UPDATE/DELETE sobre ella). */
  @Get('bitacora')
  bitacora(@Usuario() u: UsuarioActual, @Query() q: BitacoraDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT b.id_bitacora, b.tabla, b.operacion, b.id_registro, b.usuario_bd, b.rol_app,
                b.usuario_app, us.nombre AS nombre_usuario, b.fecha,
                b.valores_anteriores, b.valores_nuevos,
                count(*) OVER () AS total
           FROM banco.bitacora_auditoria b
           LEFT JOIN banco.usuario us ON us.id_usuario::text = b.usuario_app
          WHERE ($1::text IS NULL OR b.tabla = $1)
            AND ($2::text IS NULL OR b.operacion = $2)
            AND ($3::text IS NULL OR b.rol_app = $3)
            AND ($4::int IS NULL OR b.id_registro = $4)
            AND ($5::timestamptz IS NULL OR b.fecha >= $5)
            AND ($6::timestamptz IS NULL OR b.fecha < $6)
          ORDER BY b.id_bitacora DESC
          LIMIT $7 OFFSET $8`,
        [
          q.tabla ?? null,
          q.operacion ?? null,
          q.rol_app ?? null,
          q.id_registro ?? null,
          q.desde ?? null,
          q.hasta ?? null,
          q.tamano,
          q.offset,
        ],
      );
      return paginado(rows, q);
    });
  }

  @Get('usuarios')
  usuarios(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT us.id_usuario, us.username, us.nombre, r.nombre AS rol, us.id_hospital,
                h.nombre AS hospital, us.activo
           FROM banco.usuario us JOIN banco.rol r USING (id_rol)
           LEFT JOIN banco.hospital h USING (id_hospital)
          ORDER BY us.activo DESC, r.id_rol, us.username`,
      );
      return rows;
    });
  }

  /** El hash argon2id se calcula aquí; la BD valida rol ⇔ hospital (BS016). */
  @Post('usuarios')
  async crearUsuario(
    @Usuario() u: UsuarioActual,
    @Body() dto: CrearUsuarioDto,
  ) {
    const hash = await argon2.hash(dto.password, { type: argon2.argon2id });
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO banco.usuario (username, nombre, password_hash, id_rol, id_hospital)
         VALUES ($1, $2, $3, (SELECT id_rol FROM banco.rol WHERE nombre = $4), $5)
         RETURNING id_usuario, username`,
        [
          dto.username,
          dto.nombre.trim(),
          hash,
          dto.rol,
          dto.id_hospital ?? null,
        ],
      );
      return rows[0];
    });
  }

  @Patch('usuarios/:id')
  async actualizarUsuario(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarUsuarioDto,
  ) {
    const hash = dto.password
      ? await argon2.hash(dto.password, { type: argon2.argon2id })
      : null;
    // id_hospital se distingue entre "no enviado" (se conserva) y null explícito (se quita).
    // (Con useDefineForClassFields los campos opcionales existen como undefined: no
    // sirve hasOwnProperty; undefined = no enviado, null = quitar.)
    const tocaHospital = dto.id_hospital !== undefined;
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `UPDATE banco.usuario SET
            nombre = coalesce($2, nombre),
            id_rol = coalesce((SELECT id_rol FROM banco.rol WHERE nombre = $3), id_rol),
            id_hospital = CASE WHEN $4 THEN $5::int ELSE id_hospital END,
            activo = coalesce($6, activo)
          WHERE id_usuario = $1
          RETURNING id_usuario, username, activo`,
        [
          id,
          dto.nombre ?? null,
          dto.rol ?? null,
          tocaHospital,
          dto.id_hospital ?? null,
          dto.activo ?? null,
        ],
      );
      // Sentencia aparte: "SET password_hash = coalesce($x, password_hash)" LEERÍA la
      // columna, y admin no tiene SELECT sobre password_hash (privilegio por columna).
      // Este UPDATE solo la escribe.
      if (rows[0] && hash) {
        await c.query(
          'UPDATE banco.usuario SET password_hash = $2 WHERE id_usuario = $1',
          [id, hash],
        );
      }
      if (!rows[0]) throw new NotFoundException(`El usuario ${id} no existe`);
      return rows[0];
    });
  }
}
