import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles, Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila } from '../common/paginacion';
import { DbService } from '../db/db.service';

/** Hemovigilancia: cadena completa de una unidad (NOM-253-SSA1-2012). */
@Controller('trazabilidad')
@Roles('inventario', 'admin')
export class TrazabilidadController {
  constructor(private readonly db: DbService) {}

  @Get('unidades/:id')
  unidad(@Usuario() u: UsuarioActual, @Param('id', ParseIntPipe) id: number) {
    return this.db.withContext(u, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT id_unidad, estado, tipo, componente, fecha_obtencion::text, fecha_caducidad::text,
                id_donacion, fecha_donacion, tipo_donacion, volumen_ml, capturo,
                id_donante, donante, sexo, fecha_nacimiento::text,
                pruebas, hermanas,
                id_asignacion, fecha_asignacion, autorizo,
                id_solicitud, prioridad, estado_solicitud, id_hospital, hospital
           FROM banco.v_trazabilidad_unidad WHERE id_unidad = $1`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException(`La unidad ${id} no existe`);
      const movimientos = await c.query<Fila>(
        `SELECT m.tipo_movimiento, m.fecha_movimiento, m.motivo, coalesce(us.nombre, 'Sistema') AS usuario
           FROM banco.movimiento_inventario m LEFT JOIN banco.usuario us USING (id_usuario)
          WHERE m.id_unidad = $1 ORDER BY m.fecha_movimiento, m.id_movimiento`,
        [id],
      );
      return { ...rows[0], movimientos: movimientos.rows };
    });
  }
}
