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
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
} from 'class-validator';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila, PaginacionDto, paginado } from '../common/paginacion';
import { DbService } from '../db/db.service';

class ResultadoDto {
  @IsIn(['no_reactivo', 'reactivo'])
  resultado!: 'no_reactivo' | 'reactivo';
}

class FraccionarDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  componentes!: number[];
}

class PendientesDto extends PaginacionDto {
  @IsOptional() @IsIn(['tamizaje', 'fraccionar', 'todas']) filtro?: string;
}

@Controller('laboratorio')
@Roles('laboratorio')
export class LaboratorioController {
  constructor(private readonly db: DbService) {}

  /** Donaciones con pruebas pendientes o sin fraccionar. */
  @Get('donaciones')
  pendientes(@Usuario() u: UsuarioActual, @Query() q: PendientesDto) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT d.id_donacion, d.fecha_donacion, d.volumen_ml,
                t.grupo_abo || t.factor_rh AS tipo,
                p.pruebas, p.pendientes, p.reactivas,
                coalesce(un.unidades, '[]') AS unidades,
                count(*) OVER () AS total
           FROM banco.donacion d
           JOIN banco.donante dn USING (id_donante)
           JOIN banco.tipo_sanguineo t ON t.id_tipo_sanguineo = dn.id_tipo_sanguineo
          CROSS JOIN LATERAL (
                SELECT jsonb_agg(jsonb_build_object('id_prueba', pt.id_prueba, 'tipo', pt.tipo_prueba,
                                 'resultado', pt.resultado, 'fecha', pt.fecha_resultado) ORDER BY pt.id_prueba) AS pruebas,
                       count(*) FILTER (WHERE pt.resultado = 'pendiente')::int AS pendientes,
                       count(*) FILTER (WHERE pt.resultado = 'reactivo')::int AS reactivas
                  FROM banco.prueba_tamizaje pt WHERE pt.id_donacion = d.id_donacion) p
           LEFT JOIN LATERAL (
                SELECT jsonb_agg(jsonb_build_object('id_unidad', us.id_unidad, 'id_componente', us.id_componente,
                                 'componente', co.nombre, 'estado', us.estado) ORDER BY us.id_unidad) AS unidades
                  FROM banco.unidad_sangre us JOIN banco.componente co USING (id_componente)
                 WHERE us.id_donacion = d.id_donacion) un ON true
          WHERE CASE $1::text
                  WHEN 'tamizaje'   THEN p.pendientes > 0
                  WHEN 'fraccionar' THEN un.unidades IS NULL AND p.reactivas = 0
                  WHEN 'todas'      THEN true
                  ELSE p.pendientes > 0 OR (un.unidades IS NULL AND p.reactivas = 0)
                END
          ORDER BY d.fecha_donacion
          LIMIT $2 OFFSET $3`,
        [q.filtro ?? null, q.tamano, q.offset],
      );
      return paginado(rows, q);
    });
  }

  /**
   * Captura un resultado. El laboratorio solo tiene UPDATE(resultado): la BD pone la
   * fecha, impide cambiar un resultado definitivo (BS014) y, vía trigger, libera o
   * descarta las unidades (falla segura).
   */
  @Patch('pruebas/:id')
  capturar(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResultadoDto,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `UPDATE banco.prueba_tamizaje SET resultado = $2 WHERE id_prueba = $1
         RETURNING id_prueba, id_donacion, tipo_prueba, resultado, fecha_resultado`,
        [id, dto.resultado],
      );
      if (!rows[0]) throw new NotFoundException(`La prueba ${id} no existe`);
      const unidades = await c.query<Fila>(
        'SELECT id_unidad, estado FROM banco.unidad_sangre WHERE id_donacion = $1 ORDER BY id_unidad',
        [rows[0].id_donacion],
      );
      return { ...rows[0], unidades: unidades.rows };
    });
  }

  @Post('donaciones/:id/fraccionar')
  fraccionar(
    @Usuario() u: UsuarioActual,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FraccionarDto,
  ) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT id_unidad, id_componente, estado, fecha_obtencion::text, fecha_caducidad::text
           FROM banco.fn_fraccionar_donacion($1, $2::int[])`,
        [id, dto.componentes],
      );
      return rows;
    });
  }
}
