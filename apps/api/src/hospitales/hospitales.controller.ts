import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila } from '../common/paginacion';
import { DbService } from '../db/db.service';

class HospitalDto {
  @IsString() @Length(3, 150) nombre!: string;
  @IsString() @Length(5, 250) direccion!: string;
  @Matches(/^[0-9 +()-]{7,20}$/, { message: 'Teléfono inválido' })
  telefono!: string;
}

class ActualizarHospitalDto {
  @IsOptional() @IsString() @Length(3, 150) nombre?: string;
  @IsOptional() @IsString() @Length(5, 250) direccion?: string;
  @IsOptional() @Matches(/^[0-9 +()-]{7,20}$/) telefono?: string;
}

@Controller()
export class HospitalesController {
  constructor(private readonly db: DbService) {}

  /** Catálogos para las listas de selección de la UI (usabilidad: sin texto libre). */
  @Get('catalogos')
  catalogos(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      const [tipos, componentes, hospitales, roles] = await Promise.all([
        c.query<Fila>(
          `SELECT id_tipo_sanguineo, grupo_abo || factor_rh AS etiqueta
             FROM banco.tipo_sanguineo ORDER BY id_tipo_sanguineo`,
        ),
        c.query<Fila>(
          'SELECT id_componente, nombre, vida_util_dias, dias_alerta_caducidad FROM banco.componente ORDER BY id_componente',
        ),
        c.query<Fila>(
          'SELECT id_hospital, nombre FROM banco.hospital ORDER BY nombre',
        ),
        c.query<Fila>('SELECT id_rol, nombre FROM banco.rol ORDER BY id_rol'),
      ]);
      return {
        tipos: tipos.rows,
        componentes: componentes.rows,
        hospitales: hospitales.rows,
        roles: roles.rows,
      };
    });
  }

  @Get('hospitales')
  listar(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        'SELECT id_hospital, nombre, direccion, telefono FROM banco.hospital ORDER BY nombre',
      );
      return rows;
    });
  }

  @Post('hospitales')
  @Roles('admin')
  crear(@Usuario() u: UsuarioActual, @Body() dto: HospitalDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO banco.hospital (nombre, direccion, telefono) VALUES ($1, $2, $3)
         RETURNING id_hospital, nombre, direccion, telefono`,
        [dto.nombre.trim(), dto.direccion.trim(), dto.telefono],
      );
      return rows[0];
    });
  }

  @Patch('hospitales/:id')
  @Roles('admin')
  actualizar(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarHospitalDto,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `UPDATE banco.hospital SET nombre = coalesce($2, nombre),
                direccion = coalesce($3, direccion), telefono = coalesce($4, telefono)
          WHERE id_hospital = $1 RETURNING id_hospital, nombre, direccion, telefono`,
        [id, dto.nombre ?? null, dto.direccion ?? null, dto.telefono ?? null],
      );
      if (!rows[0]) throw new NotFoundException(`El hospital ${id} no existe`);
      return rows[0];
    });
  }
}
