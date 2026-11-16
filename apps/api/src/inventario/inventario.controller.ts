import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila, PaginacionDto, paginado } from '../common/paginacion';
import { DbService } from '../db/db.service';

const ESTADOS = [
  'cuarentena',
  'disponible',
  'asignada',
  'entregada',
  'caducada',
  'descartada',
];

class UnidadesDto extends PaginacionDto {
  @IsOptional() @IsIn(ESTADOS) estado?: string;
  @IsOptional() @IsIn(['vigentes']) vista?: 'vigentes';
  @IsOptional() @Type(() => Number) @IsInt() id_tipo_sanguineo?: number;
  @IsOptional() @Type(() => Number) @IsInt() id_componente?: number;
  @IsOptional() @IsIn(['rojo', 'amarillo', 'verde']) semaforo?: string;
  @IsOptional() @Type(() => Number) @IsInt() id_unidad?: number;
}

class BajaDto {
  @IsString()
  @Length(5, 250, {
    message: 'Describe el motivo de la baja (5 a 250 caracteres)',
  })
  motivo!: string;
}

@Controller('inventario')
export class InventarioController {
  constructor(private readonly db: DbService) {}

  /**
   * Listado con semáforo. Antes de leer se marca lo vencido (fn_marcar_caducadas),
   * así la caducidad se refleja sin necesidad de un cron.
   */
  @Get('unidades')
  @Roles('inventario', 'laboratorio', 'admin')
  unidades(@Usuario() u: UsuarioActual, @Query() q: UnidadesDto) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_marcar_caducadas()');
      const { rows } = await c.query<Fila>(
        `SELECT id_unidad, id_donacion, estado, tipo, componente, id_tipo_sanguineo, id_componente,
                fecha_obtencion::text, fecha_caducidad::text, dias_restantes, semaforo,
                count(*) OVER () AS total
           FROM banco.v_inventario_unidades
          WHERE ($1::text IS NULL OR estado = $1)
            AND ($2::text IS NULL OR estado IN ('cuarentena', 'disponible'))
            AND ($3::int IS NULL OR id_tipo_sanguineo = $3)
            AND ($4::int IS NULL OR id_componente = $4)
            AND ($5::text IS NULL OR semaforo = $5)
            AND ($6::int IS NULL OR id_unidad = $6)
          ORDER BY CASE WHEN estado IN ('cuarentena', 'disponible') THEN 0 ELSE 1 END,
                   fecha_caducidad, id_unidad
          LIMIT $7 OFFSET $8`,
        [
          q.estado ?? null,
          q.vista ?? null,
          q.id_tipo_sanguineo ?? null,
          q.id_componente ?? null,
          q.semaforo ?? null,
          q.id_unidad ?? null,
          q.tamano,
          q.offset,
        ],
      );
      return paginado(rows, q);
    });
  }

  @Get('disponibilidad')
  disponibilidad(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_marcar_caducadas()');
      const { rows } = await c.query<Fila>(
        `SELECT id_tipo_sanguineo, tipo, id_componente, componente,
                disponibles::int, por_caducar_7d::int, proxima_caducidad::text
           FROM banco.v_disponibilidad ORDER BY id_componente, id_tipo_sanguineo`,
      );
      return rows;
    });
  }

  @Get('por-caducar')
  @Roles('inventario', 'laboratorio', 'admin')
  porCaducar(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_marcar_caducadas()');
      const { rows } = await c.query<Fila>(
        `SELECT id_unidad, estado, tipo, componente, fecha_caducidad::text, dias_restantes, semaforo
           FROM banco.v_unidades_por_caducar ORDER BY fecha_caducidad, id_unidad LIMIT 200`,
      );
      return rows;
    });
  }

  @Get('unidades/:id/movimientos')
  @Roles('inventario', 'admin')
  movimientos(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT m.id_movimiento, m.tipo_movimiento, m.fecha_movimiento, m.motivo,
                coalesce(us.nombre, 'Sistema') AS usuario
           FROM banco.movimiento_inventario m
           LEFT JOIN banco.usuario us USING (id_usuario)
          WHERE m.id_unidad = $1 ORDER BY m.fecha_movimiento, m.id_movimiento`,
        [id],
      );
      return rows;
    });
  }

  /** Unidades que se pueden asignar a una solicitud, en orden FEFO. */
  @Get('compatibles/:idSolicitud')
  @Roles('inventario')
  compatibles(
    @Usuario() u: UsuarioActual,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
  ) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_marcar_caducadas()');
      const { rows } = await c.query<Fila>(
        `SELECT v.id_unidad, v.tipo, v.componente, v.fecha_caducidad::text, v.dias_restantes, v.semaforo
           FROM banco.solicitud s
           JOIN banco.v_inventario_unidades v
             ON v.id_tipo_sanguineo = s.id_tipo_sanguineo AND v.id_componente = s.id_componente
          WHERE s.id_solicitud = $1 AND v.estado = 'disponible' AND v.fecha_caducidad >= current_date
          ORDER BY v.fecha_caducidad, v.id_unidad
          LIMIT 50`,
        [idSolicitud],
      );
      return rows;
    });
  }

  @Post('unidades/:id/baja')
  @HttpCode(200)
  @Roles('inventario')
  baja(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BajaDto,
  ) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_dar_baja($1, $2)', [id, dto.motivo]);
      return { id_unidad: id, estado: 'descartada' };
    });
  }

  @Post('unidades/:id/entregar')
  @HttpCode(200)
  @Roles('inventario')
  entregar(@Usuario() u: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_entregar_unidad($1)', [id]);
      return { id_unidad: id, estado: 'entregada' };
    });
  }
}
