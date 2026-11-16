/**
 * Seguridad en la BD: privilegios mínimos por rol, RLS por hospital y bitácora
 * inmodificable. Evidencia para el atributo de calidad "Seguridad".
 */
import { PoolClient } from 'pg';
import { ContextoInvalidoError, RolApp } from '../../src/db/contexto';
import {
  asignar,
  como,
  conOwner,
  conSuper,
  crearDonacion,
  crearPoolApp,
  crearSolicitud,
  ERITRO,
  guardarEvidencia,
  idComponente,
  idTipo,
  sqlstate,
  Usuarios,
  usuariosDemo,
} from '../helpers/bd';

const filas: string[] = [];

describe('Seguridad en PostgreSQL', () => {
  const pool = crearPoolApp(5);
  let u: Usuarios;
  let tipo: number;
  let eritro: number;

  beforeAll(async () => {
    u = await usuariosDemo(pool);
    tipo = await idTipo('O+');
    eritro = await idComponente(ERITRO);
  });

  afterAll(async () => {
    await pool.end();
    guardarEvidencia(
      'resultados-seguridad.md',
      `# Resultados de seguridad (generado por seguridad.spec.ts)\n\n` +
        `Fecha: ${new Date().toISOString()}\n\n` +
        `| Verificación | Esperado | Obtenido |\n|---|---|---|\n${filas.join('\n')}\n`,
    );
  });

  /** Ejecuta sql con el rol dado y devuelve 'OK' o el SQLSTATE. */
  async function intentar(
    ctx: Usuarios[keyof Usuarios],
    fn: (c: PoolClient) => Promise<unknown>,
  ): Promise<string> {
    try {
      await como(pool, ctx, fn);
      return 'OK';
    } catch (e) {
      return sqlstate(e) ?? String(e);
    }
  }

  function registrar(caso: string, esperado: string, obtenido: string) {
    filas.push(`| ${caso} | ${esperado} | ${obtenido} |`);
    expect(obtenido).toBe(esperado);
  }

  describe('cuenta de conexión app_login', () => {
    it('sin SET ROLE no puede leer nada (no hereda privilegios)', async () => {
      let codigo = 'OK';
      try {
        await pool.query('SELECT count(*) FROM banco.unidad_sangre');
      } catch (e) {
        codigo = sqlstate(e) ?? '';
      }
      registrar('app_login sin SET ROLE lee unidad_sangre', '42501', codigo);
    });

    it('su contraseña está guardada como verificador SCRAM-SHA-256', async () => {
      const metodo = await conSuper(
        async (c) =>
          (
            await c.query<{ m: string }>(
              "SELECT split_part(rolpassword, '$', 1) AS m FROM pg_authid WHERE rolname = 'app_login'",
            )
          ).rows[0].m,
      );
      registrar('Hash de contraseña de app_login', 'SCRAM-SHA-256', metodo);
    });

    it('withContext rechaza roles fuera de la lista blanca antes de tocar la BD', async () => {
      const malicioso = 'admin; DROP TABLE banco.donante' as RolApp;
      await expect(
        como(pool, { idUsuario: 1, rol: malicioso }, () => Promise.resolve()),
      ).rejects.toBeInstanceOf(ContextoInvalidoError);
      filas.push(
        '| Rol inyectado en withContext | ContextoInvalidoError | ContextoInvalidoError |',
      );
    });
  });

  describe('privilegios mínimos por rol', () => {
    it('hospital no ve datos personales de donantes', async () => {
      registrar(
        'hospital SELECT donante',
        '42501',
        await intentar(u.norte, (c) => c.query('SELECT * FROM banco.donante')),
      );
      registrar(
        'hospital SELECT unidad_sangre.id_donacion',
        '42501',
        await intentar(u.norte, (c) =>
          c.query('SELECT id_donacion FROM banco.unidad_sangre'),
        ),
      );
      registrar(
        'hospital SELECT columnas permitidas de unidad_sangre',
        'OK',
        await intentar(u.norte, (c) =>
          c.query('SELECT id_unidad, estado FROM banco.unidad_sangre LIMIT 1'),
        ),
      );
    });

    it('nadie lee password_hash', async () => {
      for (const rol of ['admin', 'inventario'] as const) {
        registrar(
          `${rol} SELECT usuario.password_hash`,
          '42501',
          await intentar(u[rol], (c) =>
            c.query('SELECT password_hash FROM banco.usuario'),
          ),
        );
      }
    });

    it('inventario no modifica unidades con UPDATE directo (solo vía funciones)', async () => {
      registrar(
        'inventario UPDATE unidad_sangre',
        '42501',
        await intentar(u.inventario, (c) =>
          c.query("UPDATE banco.unidad_sangre SET estado = 'disponible'"),
        ),
      );
      registrar(
        'inventario INSERT asignacion',
        '42501',
        await intentar(u.inventario, (c) =>
          c.query('INSERT INTO banco.asignacion DEFAULT VALUES'),
        ),
      );
    });

    it('recepción no puede asignar ni capturar resultados', async () => {
      registrar(
        'recepcion CALL sp_asignar_unidad',
        '42501',
        await intentar(u.recepcion, (c) =>
          c.query('CALL banco.sp_asignar_unidad(1, 1, NULL)'),
        ),
      );
      registrar(
        'recepcion UPDATE prueba_tamizaje',
        '42501',
        await intentar(u.recepcion, (c) =>
          c.query("UPDATE banco.prueba_tamizaje SET resultado = 'no_reactivo'"),
        ),
      );
    });

    it('laboratorio solo puede actualizar la columna resultado', async () => {
      registrar(
        'laboratorio UPDATE prueba_tamizaje.tipo_prueba',
        '42501',
        await intentar(u.laboratorio, (c) =>
          c.query("UPDATE banco.prueba_tamizaje SET tipo_prueba = 'VIH'"),
        ),
      );
    });
  });

  describe('RLS por hospital', () => {
    it('cada hospital ve solo sus solicitudes', async () => {
      const sNorte = await crearSolicitud(pool, u.norte, tipo, eritro);
      const sSur = await crearSolicitud(pool, u.sur, tipo, eritro);
      const visibles = await como(
        pool,
        u.norte,
        async (c) =>
          (
            await c.query<{ id_solicitud: number; id_hospital: number }>(
              'SELECT id_solicitud, id_hospital FROM banco.solicitud',
            )
          ).rows,
      );
      const ajenas = visibles.filter(
        (s) => s.id_hospital !== u.norte.idHospital,
      );
      registrar(
        'Norte ve solicitudes de otros hospitales',
        '0',
        String(ajenas.length),
      );
      expect(visibles.some((s) => s.id_solicitud === sNorte)).toBe(true);
      expect(visibles.some((s) => s.id_solicitud === sSur)).toBe(false);
    });

    it('la vista v_solicitudes_pendientes respeta la RLS (security_invoker)', async () => {
      const ajenas = await como(pool, u.sur, async (c) =>
        Number(
          (
            await c.query(
              'SELECT count(*) FROM banco.v_solicitudes_pendientes WHERE id_hospital <> $1',
              [u.sur.idHospital],
            )
          ).rows[0].count,
        ),
      );
      registrar('Sur ve pendientes ajenas en la vista', '0', String(ajenas));
    });

    it('un hospital no puede crear solicitudes a nombre de otro (WITH CHECK)', async () => {
      registrar(
        'Norte INSERT solicitud con id_hospital del Sur',
        '42501',
        await intentar(u.norte, (c) =>
          c.query(
            'INSERT INTO banco.solicitud (id_hospital, id_tipo_sanguineo, id_componente, cantidad) VALUES ($1, $2, $3, 1)',
            [u.sur.idHospital, tipo, eritro],
          ),
        ),
      );
    });

    it('un hospital no puede cancelar solicitudes de otro', async () => {
      const sSur = await crearSolicitud(pool, u.sur, tipo, eritro);
      registrar(
        'Norte cancela solicitud del Sur',
        'BS007',
        await intentar(u.norte, (c) =>
          c.query('SELECT banco.fn_cancelar_solicitud($1)', [sSur]),
        ),
      );
    });
  });

  describe('bitácora de auditoría', () => {
    it('ningún rol de la app puede modificarla o borrarla', async () => {
      for (const rol of ['admin', 'inventario'] as const) {
        registrar(
          `${rol} UPDATE bitacora_auditoria`,
          '42501',
          await intentar(u[rol], (c) =>
            c.query("UPDATE banco.bitacora_auditoria SET tabla = 'x'"),
          ),
        );
        registrar(
          `${rol} DELETE bitacora_auditoria`,
          '42501',
          await intentar(u[rol], (c) =>
            c.query('DELETE FROM banco.bitacora_auditoria'),
          ),
        );
      }
      registrar(
        'admin INSERT bitacora_auditoria (falsificar)',
        '42501',
        await intentar(u.admin, (c) =>
          c.query(
            "INSERT INTO banco.bitacora_auditoria (tabla, operacion, usuario_bd) VALUES ('x', 'INSERT', 'x')",
          ),
        ),
      );
    });

    it('ni el dueño puede hacer UPDATE, DELETE o TRUNCATE (trigger BS013)', async () => {
      for (const sql of [
        "UPDATE bitacora_auditoria SET tabla = 'x'",
        'DELETE FROM bitacora_auditoria',
        'TRUNCATE bitacora_auditoria',
      ]) {
        let codigo = 'OK';
        try {
          await conOwner((c) => c.query(sql));
        } catch (e) {
          codigo = sqlstate(e) ?? '';
        }
        registrar(`banco_owner: ${sql.split(' ')[0]}`, 'BS013', codigo);
      }
    });

    it('una asignación hecha por rol_inventario queda con ese rol y ese usuario, no con el dueño', async () => {
      const {
        unidades: [unidad],
      } = await crearDonacion(pool, u, { tipo, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, tipo, eritro);
      await asignar(pool, u.inventario, s, unidad);

      const filasBitacora = await como(
        pool,
        u.admin,
        async (c) =>
          (
            await c.query<{
              tabla: string;
              operacion: string;
              usuario_bd: string;
              usuario_app: string;
              rol_app: string;
            }>(
              `SELECT tabla, operacion, usuario_bd, usuario_app, rol_app
               FROM banco.bitacora_auditoria
              WHERE (tabla = 'asignacion' AND valores_nuevos ->> 'id_unidad' = $1)
                 OR (tabla = 'unidad_sangre' AND operacion = 'UPDATE' AND id_registro = $2
                     AND valores_nuevos ->> 'estado' = 'asignada')
              ORDER BY id_bitacora`,
              [String(unidad), unidad],
            )
          ).rows,
      );
      const asig = filasBitacora.find((f) => f.tabla === 'asignacion');
      const upd = filasBitacora.find((f) => f.tabla === 'unidad_sangre');
      expect(asig).toBeDefined();
      expect(upd).toBeDefined();
      for (const f of [asig!, upd!]) {
        // La identidad real sale de withContext (app.rol / app.id_usuario)…
        expect(f.rol_app).toBe('rol_inventario');
        expect(f.usuario_app).toBe(String(u.inventario.idUsuario));
        // …porque dentro de SECURITY DEFINER current_user es el dueño.
        expect(f.usuario_bd).toBe('banco_owner');
      }
      filas.push(
        `| Bitácora de asignación: rol_app / usuario_app / usuario_bd | rol_inventario / ${u.inventario.idUsuario} / banco_owner | ${asig!.rol_app} / ${asig!.usuario_app} / ${asig!.usuario_bd} |`,
      );
    });
  });
});
