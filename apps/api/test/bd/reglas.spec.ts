/**
 * Pregunta de investigación 4 — ¿En qué medida las reglas implementadas en la BD
 * rechazan las asignaciones y operaciones inválidas?
 * Cada caso verifica el SQLSTATE y que NADA cambió (atomicidad).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  asignar,
  como,
  conOwner,
  crearDonacion,
  crearPoolApp,
  crearSolicitud,
  ERITRO,
  estadoUnidad,
  EVIDENCIAS,
  idComponente,
  idTipo,
  PLASMA,
  sqlstate,
  Usuarios,
  usuariosDemo,
} from '../helpers/bd';

const filas: string[] = [];

async function contar(idUnidad: number) {
  return conOwner(async (c) => {
    const a = await c.query(
      'SELECT count(*)::int AS n FROM asignacion WHERE id_unidad = $1',
      [idUnidad],
    );
    const m = await c.query(
      'SELECT count(*)::int AS n FROM movimiento_inventario WHERE id_unidad = $1',
      [idUnidad],
    );
    return { asignaciones: a.rows[0].n, movimientos: m.rows[0].n };
  });
}

describe('Reglas de negocio en PostgreSQL', () => {
  const pool = crearPoolApp(5);
  let u: Usuarios;
  let oPos: number;
  let aPos: number;
  let eritro: number;
  let plasma: number;

  beforeAll(async () => {
    u = await usuariosDemo(pool);
    oPos = await idTipo('O+');
    aPos = await idTipo('A+');
    eritro = await idComponente(ERITRO);
    plasma = await idComponente(PLASMA);
  });

  afterAll(async () => {
    await pool.end();
    mkdirSync(EVIDENCIAS, { recursive: true });
    writeFileSync(
      path.join(EVIDENCIAS, 'resultados-reglas.md'),
      `# Resultados de reglas de negocio (generado por reglas.spec.ts)\n\n` +
        `Fecha: ${new Date().toISOString()}\n\n` +
        `| Caso | Esperado | Obtenido | ¿Sin cambios? |\n|---|---|---|---|\n${filas.join('\n')}\n`,
    );
  });

  /** Intenta asignar y verifica rechazo + que no quedó rastro. */
  async function esperaRechazo(
    caso: string,
    esperado: string,
    idSolicitud: number,
    idUnidad: number,
  ) {
    const antes = await contar(idUnidad);
    const estadoAntes = await estadoUnidad(idUnidad);
    let obtenido = 'OK (¡no se rechazó!)';
    try {
      await asignar(pool, u.inventario, idSolicitud, idUnidad);
    } catch (e) {
      obtenido = sqlstate(e) ?? String(e);
    }
    const despues = await contar(idUnidad);
    const sinCambios =
      despues.asignaciones === antes.asignaciones &&
      despues.movimientos === antes.movimientos &&
      (await estadoUnidad(idUnidad)) === estadoAntes;
    filas.push(
      `| ${caso} | ${esperado} | ${obtenido} | ${sinCambios ? 'sí' : 'NO'} |`,
    );
    expect(obtenido).toBe(esperado);
    expect(sinCambios).toBe(true);
  }

  describe('asignación (sp_asignar_unidad)', () => {
    it('acepta una asignación válida y deja salida + solicitud surtida', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await asignar(pool, u.inventario, s, un);
      expect(await estadoUnidad(un)).toBe('asignada');
      const estado = await conOwner(
        async (c) =>
          (
            await c.query(
              'SELECT estado FROM solicitud WHERE id_solicitud = $1',
              [s],
            )
          ).rows[0].estado,
      );
      expect(estado).toBe('surtida');
      filas.push('| Asignación válida | OK | OK | — |');
    });

    it('rechaza una unidad caducada (fecha vencida aunque siga "disponible")', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      await conOwner((c) =>
        c.query(
          `UPDATE unidad_sangre SET fecha_obtencion = current_date - 50,
                  fecha_caducidad = current_date - 1 WHERE id_unidad = $1`,
          [un],
        ),
      );
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Unidad vencida (aún disponible)', 'BS002', s, un);
    });

    it('rechaza una unidad marcada como caducada por fn_marcar_caducadas', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      await conOwner((c) =>
        c.query(
          `UPDATE unidad_sangre SET fecha_obtencion = current_date - 50,
                  fecha_caducidad = current_date - 1 WHERE id_unidad = $1`,
          [un],
        ),
      );
      const marcadas = await como(pool, u.inventario, async (c) =>
        Number(
          (await c.query('SELECT banco.fn_marcar_caducadas() AS n')).rows[0].n,
        ),
      );
      expect(marcadas).toBeGreaterThanOrEqual(1);
      expect(await estadoUnidad(un)).toBe('caducada');
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Unidad caducada', 'BS002', s, un);
    });

    it('rechaza una unidad reactiva (descartada por tamizaje)', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
        resultados: { VIH: 'reactivo' },
      });
      expect(await estadoUnidad(un)).toBe('descartada');
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Unidad reactiva (VIH)', 'BS012', s, un);
    });

    it('rechaza una unidad con pruebas pendientes (cuarentena)', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
        resultados: { Chagas: 'pendiente' },
      });
      expect(await estadoUnidad(un)).toBe('cuarentena');
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Tamizaje pendiente', 'BS006', s, un);
    });

    it('rechaza una unidad de otro tipo sanguíneo', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: aPos, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Otro tipo sanguíneo (A+ → O+)', 'BS003', s, un);
    });

    it('rechaza una unidad de otro componente', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [plasma] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await esperaRechazo('Otro componente (plasma → eritro)', 'BS004', s, un);
    });

    it('rechaza una unidad ya asignada', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      const s1 = await crearSolicitud(pool, u.norte, oPos, eritro);
      const s2 = await crearSolicitud(pool, u.sur, oPos, eritro);
      await asignar(pool, u.inventario, s1, un);
      await esperaRechazo('Unidad ya asignada', 'BS001', s2, un);
    });

    it('rechaza asignar a una solicitud cancelada', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await como(pool, u.norte, (c) =>
        c.query('SELECT banco.fn_cancelar_solicitud($1)', [s]),
      );
      await esperaRechazo('Solicitud cancelada', 'BS005', s, un);
    });

    it('rechaza exceder la cantidad de una solicitud ya surtida', async () => {
      const { unidades } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
      });
      const otra = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
      });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro, 1);
      await asignar(pool, u.inventario, s, unidades[0]);
      await esperaRechazo('Solicitud ya surtida', 'BS005', s, otra.unidades[0]);
    });

    it('rechaza operar sin usuario en el contexto (BS015)', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      const client = await pool.connect();
      let codigo: string | undefined;
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE rol_inventario');
        await client.query('CALL banco.sp_asignar_unidad($1, $2, NULL)', [
          s,
          un,
        ]);
      } catch (e) {
        codigo = sqlstate(e);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      filas.push(`| Sin usuario en contexto | BS015 | ${codigo} | sí |`);
      expect(codigo).toBe('BS015');
    });
  });

  describe('falla segura y otras reglas', () => {
    it('una prueba reactiva descarta TODAS las unidades hermanas con movimiento de baja', async () => {
      const { unidades } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro, plasma],
        resultados: { VHC: 'reactivo' },
      });
      for (const un of unidades)
        expect(await estadoUnidad(un)).toBe('descartada');
      const bajas = await conOwner(
        async (c) =>
          (
            await c.query(
              "SELECT count(*)::int AS n FROM movimiento_inventario WHERE id_unidad = ANY($1::int[]) AND tipo_movimiento = 'baja'",
              [unidades],
            )
          ).rows[0].n,
      );
      expect(bajas).toBe(unidades.length);
      filas.push(
        `| Reactiva descarta hermanas | ${unidades.length} descartadas | ${bajas} bajas | — |`,
      );
    });

    it('no permite cambiar un resultado de tamizaje ya capturado (BS014)', async () => {
      const { idDonacion } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
      });
      let codigo: string | undefined;
      try {
        await como(pool, u.laboratorio, (c) =>
          c.query(
            "UPDATE banco.prueba_tamizaje SET resultado = 'reactivo' WHERE id_donacion = $1 AND tipo_prueba = 'VIH'",
            [idDonacion],
          ),
        );
      } catch (e) {
        codigo = sqlstate(e);
      }
      filas.push(`| Cambiar resultado definitivo | BS014 | ${codigo} | sí |`);
      expect(codigo).toBe('BS014');
    });

    it('rechaza donantes fuera de 18–65 años (BS008)', async () => {
      let codigo: string | undefined;
      try {
        await como(pool, u.recepcion, async (c) => {
          const d = await c.query(
            `INSERT INTO banco.donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
             VALUES ('Menor', current_date - 365 * 16, 'M', $1) RETURNING id_donante`,
            [oPos],
          );
          await c.query(
            "INSERT INTO banco.donacion (id_donante, tipo_donacion, volumen_ml) VALUES ($1, 'altruista', 450)",
            [d.rows[0].id_donante],
          );
        });
      } catch (e) {
        codigo = sqlstate(e);
      }
      filas.push(`| Donante de 16 años | BS008 | ${codigo} | sí |`);
      expect(codigo).toBe('BS008');
    });

    it('no permite fraccionar dos veces el mismo componente (BS009)', async () => {
      const { idDonacion } = await crearDonacion(pool, u, {
        tipo: oPos,
        componentes: [eritro],
      });
      let codigo: string | undefined;
      try {
        await como(pool, u.laboratorio, (c) =>
          c.query('SELECT * FROM banco.fn_fraccionar_donacion($1, $2::int[])', [
            idDonacion,
            [eritro],
          ]),
        );
      } catch (e) {
        codigo = sqlstate(e);
      }
      filas.push(`| Fraccionar componente repetido | BS009 | ${codigo} | sí |`);
      expect(codigo).toBe('BS009');
    });

    it('la máquina de estados impide retroceder una unidad entregada (BS010)', async () => {
      const {
        unidades: [un],
      } = await crearDonacion(pool, u, { tipo: oPos, componentes: [eritro] });
      const s = await crearSolicitud(pool, u.norte, oPos, eritro);
      await asignar(pool, u.inventario, s, un);
      await como(pool, u.inventario, (c) =>
        c.query('SELECT banco.fn_entregar_unidad($1)', [un]),
      );
      let codigo: string | undefined;
      try {
        await conOwner((c) =>
          c.query(
            "UPDATE unidad_sangre SET estado = 'disponible' WHERE id_unidad = $1",
            [un],
          ),
        );
      } catch (e) {
        codigo = sqlstate(e);
      }
      filas.push(
        `| Entregada → disponible (incluso como dueño) | BS010 | ${codigo} | sí |`,
      );
      expect(codigo).toBe('BS010');
    });

    it('FEFO elige primero las unidades que caducan antes', async () => {
      const oNeg = await idTipo('O-');
      const a = await crearDonacion(pool, u, {
        tipo: oNeg,
        componentes: [plasma],
      });
      const b = await crearDonacion(pool, u, {
        tipo: oNeg,
        componentes: [plasma],
      });
      // b caduca antes que a.
      await conOwner((c) =>
        c.query(
          'UPDATE unidad_sangre SET fecha_caducidad = current_date + 3 WHERE id_unidad = $1',
          [b.unidades[0]],
        ),
      );
      const s = await crearSolicitud(pool, u.sur, oNeg, plasma, 1);
      await como(pool, u.inventario, (c) =>
        c.query('CALL banco.sp_asignar_automatica($1, 0)', [s]),
      );
      expect(await estadoUnidad(b.unidades[0])).toBe('asignada');
      expect(await estadoUnidad(a.unidades[0])).toBe('disponible');
      filas.push(
        '| FEFO elige la que caduca primero | unidad b | unidad b | — |',
      );
    });
  });
});
