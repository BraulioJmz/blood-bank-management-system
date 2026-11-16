import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila, PaginacionDto, paginado } from '../common/paginacion';
import { DbService } from '../db/db.service';

class CrearSolicitudDto {
  @IsInt() id_tipo_sanguineo!: number;
  @IsInt() id_componente!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) cantidad!: number;
  @IsIn(['normal', 'urgente', 'emergencia']) prioridad!: string;
}

class ListarSolicitudesDto extends PaginacionDto {
  @IsOptional()
  @IsIn(['abiertas', 'pendiente', 'parcial', 'surtida', 'cancelada'])
  estado?: string;
}

class AsignarDto {
  @IsInt() id_unidad!: number;
}

/**
 * La RLS de PostgreSQL decide qué solicitudes ve cada quien: el mismo SELECT
 * devuelve solo las del hospital para rol_hospital y todas para inventario/admin.
 */
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Roles('hospital', 'inventario', 'admin')
  listar(@Usuario() u: UsuarioActual, @Query() q: ListarSolicitudesDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT s.id_solicitud, s.id_hospital, h.nombre AS hospital,
                t.grupo_abo || t.factor_rh AS tipo, s.id_tipo_sanguineo,
                co.nombre AS componente, s.id_componente,
                s.cantidad, s.prioridad, s.estado, s.fecha_solicitud,
                (SELECT count(*)::int FROM banco.asignacion a WHERE a.id_solicitud = s.id_solicitud) AS asignadas,
                count(*) OVER () AS total
           FROM banco.solicitud s
           JOIN banco.hospital h USING (id_hospital)
           JOIN banco.tipo_sanguineo t USING (id_tipo_sanguineo)
           JOIN banco.componente co USING (id_componente)
          WHERE CASE WHEN $1::text IS NULL THEN true
                     WHEN $1 = 'abiertas' THEN s.estado IN ('pendiente', 'parcial')
                     ELSE s.estado = $1 END
          ORDER BY CASE WHEN s.estado IN ('pendiente', 'parcial') THEN 0 ELSE 1 END,
                   CASE s.prioridad WHEN 'emergencia' THEN 1 WHEN 'urgente' THEN 2 ELSE 3 END,
                   s.fecha_solicitud DESC
          LIMIT $2 OFFSET $3`,
        [q.estado ?? null, q.tamano, q.offset],
      );
      return paginado(rows, q);
    });
  }

  @Get(':id')
  @Roles('hospital', 'inventario', 'admin')
  detalle(@Usuario() u: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT s.id_solicitud, s.id_hospital, h.nombre AS hospital,
                t.grupo_abo || t.factor_rh AS tipo, s.id_tipo_sanguineo,
                co.nombre AS componente, s.id_componente,
                s.cantidad, s.prioridad, s.estado, s.fecha_solicitud
           FROM banco.solicitud s
           JOIN banco.hospital h USING (id_hospital)
           JOIN banco.tipo_sanguineo t USING (id_tipo_sanguineo)
           JOIN banco.componente co USING (id_componente)
          WHERE s.id_solicitud = $1`,
        [id],
      );
      // Para un hospital, una solicitud ajena no "existe" (RLS): 404, no 403.
      if (!rows[0]) throw new NotFoundException(`La solicitud ${id} no existe`);
      const asignaciones = await c.query<Fila>(
        `SELECT a.id_asignacion, a.fecha_asignacion, a.id_unidad, us.estado AS estado_unidad,
                us.fecha_caducidad::text, au.nombre AS autorizo
           FROM banco.asignacion a
           JOIN banco.unidad_sangre us USING (id_unidad)
           JOIN banco.usuario au ON au.id_usuario = a.id_usuario
          WHERE a.id_solicitud = $1 ORDER BY a.id_asignacion`,
        [id],
      );
      return { ...rows[0], asignaciones: asignaciones.rows };
    });
  }

  /** El hospital sale del token; la política WITH CHECK de la RLS lo vuelve a exigir. */
  @Post()
  @Roles('hospital')
  crear(@Usuario() u: UsuarioActual, @Body() dto: CrearSolicitudDto) {
    if (!u.idHospital)
      throw new ForbiddenException('Tu usuario no tiene hospital asignado');
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO banco.solicitud (id_hospital, id_tipo_sanguineo, id_componente, cantidad, prioridad)
         VALUES ($1, $2, $3, $4, $5) RETURNING id_solicitud, estado, fecha_solicitud`,
        [
          u.idHospital,
          dto.id_tipo_sanguineo,
          dto.id_componente,
          dto.cantidad,
          dto.prioridad,
        ],
      );
      return rows[0];
    });
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  @Roles('hospital', 'inventario')
  cancelar(@Usuario() u: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_cancelar_solicitud($1)', [id]);
      return { id_solicitud: id, estado: 'cancelada' };
    });
  }

  /** Asignación manual: sp_asignar_unidad bloquea la unidad (FOR UPDATE) y valida todo. */
  @Post(':id/asignar')
  @HttpCode(200)
  @Roles('inventario')
  asignar(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarDto,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<{ p_id_asignacion: number }>(
        'CALL banco.sp_asignar_unidad($1, $2, NULL)',
        [id, dto.id_unidad],
      );
      const estado = await c.query<Fila>(
        'SELECT estado FROM banco.solicitud WHERE id_solicitud = $1',
        [id],
      );
      return {
        id_asignacion: rows[0].p_id_asignacion,
        estado_solicitud: estado.rows[0]?.estado,
      };
    });
  }

  /** Asignación automática FEFO (FOR UPDATE SKIP LOCKED). */
  @Post(':id/asignar-automatica')
  @HttpCode(200)
  @Roles('inventario')
  asignarAutomatica(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.db.withContext(u, async (c) => {
      await c.query('SELECT banco.fn_marcar_caducadas()');
      const { rows } = await c.query<{ p_asignadas: number }>(
        'CALL banco.sp_asignar_automatica($1, 0)',
        [id],
      );
      const estado = await c.query<Fila>(
        'SELECT estado FROM banco.solicitud WHERE id_solicitud = $1',
        [id],
      );
      return {
        asignadas: rows[0].p_asignadas,
        estado_solicitud: estado.rows[0]?.estado,
      };
    });
  }
}
