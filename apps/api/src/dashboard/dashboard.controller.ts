import { Controller, Get } from '@nestjs/common';
import { Usuario } from '../auth/decoradores';
import type { UsuarioActual } from '../auth/tipos';
import { Fila } from '../common/paginacion';
import { DbService } from '../db/db.service';

/** Umbral de existencias bajas por tipo × componente. */
const UMBRAL_BAJO = 3;

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly db: DbService) {}

  /**
   * 1. fn_marcar_caducadas(): aplica la caducidad pendiente.
   * 2. fn_refrescar_dashboard(): refresca mv_dashboard solo si tiene más de 1 minuto
   *    (y solo una petición a la vez, con advisory lock).
   * 3. Lee la vista materializada (instantáneo aunque haya cientos de miles de unidades).
   */
  @Get()
  resumen(@Usuario() u: UsuarioActual) {
    return this.db.withContext(u, async (c) => {
      const caducadas = await c.query<{ n: number }>(
        'SELECT banco.fn_marcar_caducadas() AS n',
      );
      const foto = await c.query<{ refrescado_en: string }>(
        'SELECT banco.fn_refrescar_dashboard() AS refrescado_en',
      );
      const porEstado = await c.query<Fila>(
        `SELECT id_componente, componente, estado, total
           FROM banco.mv_dashboard ORDER BY id_componente, estado`,
      );
      const disponibilidad = await c.query<Fila>(
        `SELECT id_tipo_sanguineo, tipo, id_componente, componente,
                disponibles::int, por_caducar_7d::int, proxima_caducidad::text
           FROM banco.v_disponibilidad ORDER BY id_componente, id_tipo_sanguineo`,
      );
      const bajas = disponibilidad.rows.filter(
        (r) => Number(r.disponibles) < UMBRAL_BAJO,
      );
      const porCaducar = disponibilidad.rows.reduce(
        (s, r) => s + Number(r.por_caducar_7d),
        0,
      );

      // Solicitudes urgentes: la vista es security_invoker, así que un hospital solo
      // ve las suyas (RLS). Recepción y laboratorio no tienen acceso a solicitudes.
      let urgentes: Fila[] = [];
      let abiertas = 0;
      if (['hospital', 'inventario', 'admin'].includes(u.rol)) {
        const r = await c.query<Fila>(
          `SELECT id_solicitud, hospital, tipo, componente, cantidad, asignadas, prioridad,
                  estado, fecha_solicitud, horas_espera
             FROM banco.v_solicitudes_pendientes
            ORDER BY orden_prioridad, fecha_solicitud`,
        );
        abiertas = r.rows.length;
        urgentes = r.rows.filter((s) => s.prioridad !== 'normal').slice(0, 10);
      }

      return {
        refrescado_en: foto.rows[0].refrescado_en,
        caducadas_ahora: Number(caducadas.rows[0].n),
        por_estado: porEstado.rows,
        disponibilidad: disponibilidad.rows,
        alertas: {
          existencias_bajas: bajas,
          umbral_bajo: UMBRAL_BAJO,
          por_caducar_7d: porCaducar,
          solicitudes_urgentes: urgentes,
          solicitudes_abiertas: abiertas,
        },
      };
    });
  }
}
