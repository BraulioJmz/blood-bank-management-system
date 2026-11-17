/**
 * Pregunta de investigación 1 — ¿De qué manera el bloqueo de fila evita la doble
 * asignación de una unidad cuando varios operadores asignan al mismo tiempo?
 */
import {
  asignar,
  como,
  conOwner,
  crearDonacion,
  crearPoolApp,
  crearSolicitud,
  guardarEvidencia,
  ERITRO,
  idComponente,
  idTipo,
  PLAQUETAS,
  sqlstate,
  Usuarios,
  usuariosDemo,
} from '../helpers/bd';

const N = 20;
const resultados: string[] = [];

describe('Concurrencia en la asignación', () => {
  const pool = crearPoolApp(N + 5);
  let u: Usuarios;
  let tipo: number;
  let eritro: number;

  beforeAll(async () => {
    u = await usuariosDemo(pool);
    tipo = await idTipo('B-');
    eritro = await idComponente(ERITRO);
  });

  afterAll(async () => {
    await pool.end();
    guardarEvidencia(
      'resultados-concurrencia.md',
      `# Resultados de concurrencia (generado por concurrencia.spec.ts)\n\n` +
        `Fecha: ${new Date().toISOString()}\n\n${resultados.join('\n\n')}\n`,
    );
  });

  it(`${N} operadores asignan la MISMA unidad a la vez: exactamente 1 éxito y ${N - 1} rechazos`, async () => {
    const {
      unidades: [unidad],
    } = await crearDonacion(pool, u, { tipo, componentes: [eritro] });
    // N solicitudes distintas: el rechazo solo puede venir de la unidad, no de la solicitud.
    const solicitudes: number[] = [];
    for (let i = 0; i < N; i++) {
      solicitudes.push(await crearSolicitud(pool, u.norte, tipo, eritro));
    }

    const t0 = performance.now();
    const intentos = await Promise.allSettled(
      solicitudes.map((s) => asignar(pool, u.inventario, s, unidad)),
    );
    const ms = performance.now() - t0;

    const exitos = intentos.filter((r) => r.status === 'fulfilled').length;
    const codigos = intentos
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => sqlstate(r.reason));

    const { asignaciones, salidas } = await conOwner(async (c) => ({
      asignaciones: Number(
        (
          await c.query(
            'SELECT count(*) FROM asignacion WHERE id_unidad = $1',
            [unidad],
          )
        ).rows[0].count,
      ),
      salidas: Number(
        (
          await c.query(
            "SELECT count(*) FROM movimiento_inventario WHERE id_unidad = $1 AND tipo_movimiento = 'salida'",
            [unidad],
          )
        ).rows[0].count,
      ),
    }));

    resultados.push(
      `## Misma unidad, ${N} transacciones simultáneas (sp_asignar_unidad, FOR UPDATE)\n\n` +
        `| Métrica | Valor |\n|---|---|\n` +
        `| Transacciones concurrentes | ${N} |\n| Éxitos | ${exitos} |\n` +
        `| Rechazos | ${codigos.length} (SQLSTATE: ${[...new Set(codigos)].join(', ')}) |\n` +
        `| Filas en asignacion para la unidad | ${asignaciones} |\n` +
        `| Movimientos de salida | ${salidas} |\n| Tiempo total | ${ms.toFixed(0)} ms |`,
    );

    expect(exitos).toBe(1);
    expect(codigos).toHaveLength(N - 1);
    // BS001 = "unidad no disponible": los perdedores esperaron el candado y, al
    // releer la fila, ya la encontraron 'asignada'.
    expect(codigos.every((c) => c === 'BS001')).toBe(true);
    expect(asignaciones).toBe(1);
    expect(salidas).toBe(1);
  });

  it('segunda barrera: sin FOR UPDATE, la UK de asignacion.id_unidad rechaza el duplicado (23505)', async () => {
    const {
      unidades: [unidad],
    } = await crearDonacion(pool, u, { tipo, componentes: [eritro] });
    const s1 = await crearSolicitud(pool, u.norte, tipo, eritro);
    const s2 = await crearSolicitud(pool, u.sur, tipo, eritro);
    const idInv = u.inventario.idUsuario;

    // Simula un código "ingenuo" que lee y luego inserta, sin bloquear la fila.
    const error = await conOwner(async (t1) =>
      conOwner(async (t2) => {
        await t1.query('BEGIN');
        await t2.query('BEGIN');
        const leer = 'SELECT estado FROM unidad_sangre WHERE id_unidad = $1';
        expect((await t1.query(leer, [unidad])).rows[0].estado).toBe(
          'disponible',
        );
        expect((await t2.query(leer, [unidad])).rows[0].estado).toBe(
          'disponible',
        );
        const ins =
          'INSERT INTO asignacion (id_solicitud, id_unidad, id_usuario) VALUES ($1, $2, $3)';
        await t1.query(ins, [s1, unidad, idInv]);
        await t1.query('COMMIT');
        try {
          await t2.query(ins, [s2, unidad, idInv]);
          return null;
        } catch (e) {
          return sqlstate(e);
        } finally {
          await t2.query('ROLLBACK');
        }
      }),
    );
    resultados.push(
      `## Segunda barrera (UK uk_asignacion_unidad)\n\n` +
        `Dos transacciones leen 'disponible' sin bloquear e insertan la asignación: ` +
        `la segunda falla con SQLSTATE **${error}** (unique_violation).`,
    );
    expect(error).toBe('23505');
  });

  it('FEFO concurrente con SKIP LOCKED: solicitudes simultáneas reciben unidades distintas sin errores', async () => {
    const plaquetas = await idComponente(PLAQUETAS);
    const tipoAB = await idTipo('AB-');
    const K = 8;
    for (let i = 0; i < K; i++) {
      await crearDonacion(pool, u, { tipo: tipoAB, componentes: [plaquetas] });
    }
    const solicitudes: number[] = [];
    for (let i = 0; i < K; i++) {
      solicitudes.push(await crearSolicitud(pool, u.norte, tipoAB, plaquetas));
    }
    const t0 = performance.now();
    const res = await Promise.allSettled(
      solicitudes.map((s) =>
        como(pool, u.inventario, (c) =>
          c.query('CALL banco.sp_asignar_automatica($1, 0)', [s]),
        ),
      ),
    );
    const ms = performance.now() - t0;
    const unidades = await conOwner(async (c) =>
      (
        await c.query<{ id_unidad: number }>(
          'SELECT id_unidad FROM asignacion WHERE id_solicitud = ANY($1::int[])',
          [solicitudes],
        )
      ).rows.map((r) => r.id_unidad),
    );
    const fallos = res.filter((r) => r.status === 'rejected').length;
    resultados.push(
      `## Asignación automática FEFO concurrente (FOR UPDATE SKIP LOCKED)\n\n` +
        `| Métrica | Valor |\n|---|---|\n| Solicitudes simultáneas | ${K} |\n` +
        `| Unidades asignadas | ${unidades.length} |\n| Unidades distintas | ${new Set(unidades).size} |\n` +
        `| Errores | ${fallos} |\n| Tiempo total | ${ms.toFixed(0)} ms |`,
    );
    expect(fallos).toBe(0);
    expect(unidades).toHaveLength(K);
    expect(new Set(unidades).size).toBe(K);
  });

  it('tamizaje concurrente: dos laboratoristas capturan las 2 últimas pruebas a la vez y la unidad se libera (sin write skew)', async () => {
    const tipoA = await idTipo('A-');
    const { idDonacion, unidades } = await crearDonacion(pool, u, {
      tipo: tipoA,
      componentes: [eritro],
      resultados: { Sifilis: 'pendiente', Chagas: 'pendiente' },
    });
    const capturar = (prueba: string) =>
      como(pool, u.laboratorio, async (c) => {
        await c.query(
          "UPDATE banco.prueba_tamizaje SET resultado = 'no_reactivo' WHERE id_donacion = $1 AND tipo_prueba = $2",
          [idDonacion, prueba],
        );
        // Mantiene la transacción abierta un momento para forzar el traslape.
        await c.query('SELECT pg_sleep(0.3)');
      });
    await Promise.all([capturar('Sifilis'), capturar('Chagas')]);
    const estado = await conOwner(
      async (c) =>
        (
          await c.query(
            'SELECT estado FROM unidad_sangre WHERE id_unidad = $1',
            [unidades[0]],
          )
        ).rows[0].estado,
    );
    resultados.push(
      `## Tamizaje concurrente (bloqueo de la donación en fn_evaluar_tamizaje)\n\n` +
        `Dos transacciones simultáneas capturan las 2 últimas pruebas: estado final de la unidad = **${estado}**.`,
    );
    expect(estado).toBe('disponible');
  });
});
