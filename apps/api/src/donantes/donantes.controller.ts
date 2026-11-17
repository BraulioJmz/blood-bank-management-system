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
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila, paginado } from '../common/paginacion';
import { DbService } from '../db/db.service';
import {
  ActualizarDonanteDto,
  BuscarDonantesDto,
  CrearDonacionDto,
  CrearDonanteDto,
  ListarDonacionesDto,
} from './dto';

const COLUMNAS_DONANTE = `d.id_donante, d.nombre, d.fecha_nacimiento::text, d.sexo,
  d.id_tipo_sanguineo, t.grupo_abo || t.factor_rh AS tipo,
  date_part('year', age(d.fecha_nacimiento))::int AS edad`;

@Controller()
export class DonantesController {
  constructor(private readonly db: DbService) {}

  @Get('donantes')
  @Roles('recepcion', 'laboratorio', 'inventario', 'admin')
  buscar(@Usuario() u: UsuarioActual, @Query() q: BuscarDonantesDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT ${COLUMNAS_DONANTE},
                (SELECT max(fecha_donacion) FROM banco.donacion x WHERE x.id_donante = d.id_donante) AS ultima_donacion,
                count(*) OVER () AS total
           FROM banco.donante d JOIN banco.tipo_sanguineo t USING (id_tipo_sanguineo)
          WHERE $1::text IS NULL OR d.nombre ILIKE '%' || $1 || '%' OR d.id_donante::text = $1
          ORDER BY d.id_donante DESC
          LIMIT $2 OFFSET $3`,
        [q.q ?? null, q.tamano, q.offset],
      );
      return paginado(rows, q);
    });
  }

  @Get('donantes/:id')
  @Roles('recepcion', 'laboratorio', 'inventario', 'admin')
  detalle(@Usuario() u: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT ${COLUMNAS_DONANTE} FROM banco.donante d
           JOIN banco.tipo_sanguineo t USING (id_tipo_sanguineo) WHERE d.id_donante = $1`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException(`El donante ${id} no existe`);
      const donaciones = await c.query<Fila>(
        `SELECT id_donacion, fecha_donacion, tipo_donacion, volumen_ml FROM banco.donacion
          WHERE id_donante = $1 ORDER BY fecha_donacion DESC`,
        [id],
      );
      return { ...rows[0], donaciones: donaciones.rows };
    });
  }

  @Post('donantes')
  @Roles('recepcion')
  crear(@Usuario() u: UsuarioActual, @Body() dto: CrearDonanteDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO banco.donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
         VALUES ($1, $2, $3, $4) RETURNING id_donante`,
        [
          dto.nombre.trim(),
          dto.fecha_nacimiento,
          dto.sexo,
          dto.id_tipo_sanguineo,
        ],
      );
      return rows[0];
    });
  }

  @Patch('donantes/:id')
  @Roles('recepcion')
  actualizar(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarDonanteDto,
  ) {
    return this.db.withContext(u, async (c) => {
      // coalesce: solo cambia lo que llegó. Valores siempre parametrizados.
      const { rowCount } = await c.query<Fila>(
        `UPDATE banco.donante SET
            nombre = coalesce($2, nombre),
            fecha_nacimiento = coalesce($3::date, fecha_nacimiento),
            sexo = coalesce($4, sexo),
            id_tipo_sanguineo = coalesce($5, id_tipo_sanguineo)
          WHERE id_donante = $1`,
        [
          id,
          dto.nombre?.trim() ?? null,
          dto.fecha_nacimiento ?? null,
          dto.sexo ?? null,
          dto.id_tipo_sanguineo ?? null,
        ],
      );
      if (!rowCount) throw new NotFoundException(`El donante ${id} no existe`);
      return { id_donante: id };
    });
  }

  @Get('donaciones')
  @Roles('recepcion', 'laboratorio', 'inventario', 'admin')
  donaciones(@Usuario() u: UsuarioActual, @Query() q: ListarDonacionesDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT d.id_donacion, d.fecha_donacion, d.tipo_donacion, d.volumen_ml,
                dn.id_donante, dn.nombre AS donante, t.grupo_abo || t.factor_rh AS tipo,
                p.pruebas, p.pendientes, p.reactivas,
                count(*) OVER () AS total
           FROM banco.donacion d
           JOIN banco.donante dn USING (id_donante)
           JOIN banco.tipo_sanguineo t ON t.id_tipo_sanguineo = dn.id_tipo_sanguineo
          CROSS JOIN LATERAL (
                SELECT jsonb_object_agg(pt.tipo_prueba, pt.resultado) AS pruebas,
                       count(*) FILTER (WHERE pt.resultado = 'pendiente')::int AS pendientes,
                       count(*) FILTER (WHERE pt.resultado = 'reactivo')::int AS reactivas
                  FROM banco.prueba_tamizaje pt WHERE pt.id_donacion = d.id_donacion) p
          WHERE ($1::int IS NULL OR d.id_donante = $1)
            AND ($2::text IS DISTINCT FROM 'tamizaje' OR p.pendientes > 0)
          ORDER BY d.fecha_donacion DESC
          LIMIT $3 OFFSET $4`,
        [q.id_donante ?? null, q.estado ?? 'todas', q.tamano, q.offset],
      );
      return paginado(rows, q);
    });
  }

  /** La BD valida la edad (BS008), toma al capturista del contexto y crea las 5 pruebas. */
  @Post('donaciones')
  @Roles('recepcion')
  registrarDonacion(
    @Usuario() u: UsuarioActual,
    @Body() dto: CrearDonacionDto,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO banco.donacion (id_donante, tipo_donacion, volumen_ml)
         VALUES ($1, $2, $3) RETURNING id_donacion, fecha_donacion`,
        [dto.id_donante, dto.tipo_donacion, dto.volumen_ml],
      );
      const pruebas = await c.query<Fila>(
        'SELECT id_prueba, tipo_prueba, resultado FROM banco.prueba_tamizaje WHERE id_donacion = $1 ORDER BY id_prueba',
        [rows[0].id_donacion],
      );
      return { ...rows[0], pruebas: pruebas.rows };
    });
  }
}
