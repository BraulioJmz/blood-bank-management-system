/**
 * Pregunta de investigación 2 — ¿En qué porcentaje se reduce el tiempo de la
 * consulta de disponibilidad con índices, con ≥ 100 000 unidades?
 *
 *   npm run benchmark -- [--unidades 100000] [--dias 1500] [--repeticiones 15]
 *
 * 1. Crea una BD aislada `banco_bench` (migraciones + seeds + datos sintéticos).
 * 2. VACUUM ANALYZE: estadísticas frescas y visibility map (permite index-only scans).
 * 3. Para cada consulta: EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) N veces CON índices y
 *    N veces SIN índices. "Sin índices" = BEGIN; DROP INDEX …; EXPLAIN …; ROLLBACK:
 *    el DDL de PostgreSQL es transaccional, así que el ROLLBACK "devuelve" los índices
 *    sin reconstruirlos (DROP INDEX toma ACCESS EXCLUSIVE, aceptable en una BD de pruebas).
 * 4. Escribe docs/evidencias/benchmark.md (mediana, % de mejora, planes y buffers).
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { clienteOwner } from '../db/lib/config';
import { resetear } from '../db/reset';
import { generar } from '../db/sintetico/generar';

const DB = 'banco_bench';
const INDICES = ['banco.ix_unidad_disponible', 'banco.ix_unidad_vigente_caducidad'];

const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};

interface Consulta {
  nombre: string;
  descripcion: string;
  sql: string;
  params: unknown[];
}

interface Medicion {
  mediana: number;
  min: number;
  max: number;
  nodo: string;
  indice?: string;
  hit: number;
  read: number;
  filas: number;
}

/** Recorre el plan y devuelve el nodo de acceso a unidad_sangre más relevante. */
function nodoAcceso(plan: any): { tipo: string; indice?: string } {
  const pila = [plan];
  while (pila.length) {
    const n = pila.shift();
    if (n['Relation Name'] === 'unidad_sangre') return { tipo: n['Node Type'], indice: n['Index Name'] };
    pila.push(...(n.Plans ?? []));
  }
  return { tipo: plan['Node Type'] };
}

async function medir(c: Client, q: Consulta, reps: number, sinIndices: boolean): Promise<Medicion> {
  const tiempos: number[] = [];
  let ultimo: any;
  for (let i = 0; i < reps + 1; i++) {
    await c.query('BEGIN');
    if (sinIndices) for (const ix of INDICES) await c.query(`DROP INDEX ${ix}`);
    const { rows } = await c.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.params);
    await c.query('ROLLBACK');
    const r = rows[0]['QUERY PLAN'][0];
    if (i > 0) tiempos.push(r['Execution Time']); // la 1.ª corrida calienta la caché
    ultimo = r;
  }
  tiempos.sort((a, b) => a - b);
  const acceso = nodoAcceso(ultimo.Plan);
  return {
    mediana: tiempos[Math.floor(tiempos.length / 2)],
    min: tiempos[0],
    max: tiempos[tiempos.length - 1],
    nodo: acceso.tipo,
    indice: acceso.indice,
    hit: ultimo.Plan['Shared Hit Blocks'] ?? 0,
    read: ultimo.Plan['Shared Read Blocks'] ?? 0,
    filas: ultimo.Plan['Actual Rows'],
  };
}

async function main() {
  const unidades = arg('unidades', 100000);
  const dias = arg('dias', 1500);
  const reps = arg('repeticiones', 15);
  const silencio = () => undefined;

  console.log(`Preparando ${DB} con ≈${unidades} unidades (${dias} días)…`);
  await resetear(DB, silencio);
  await generar(DB, unidades, dias);

  const c = clienteOwner(DB);
  await c.connect();
  try {
    await c.query('VACUUM ANALYZE banco.unidad_sangre');
    const meta = (
      await c.query(`SELECT version() AS v,
          (SELECT count(*) FROM banco.unidad_sangre)::int AS total,
          (SELECT count(*) FROM banco.unidad_sangre WHERE estado = 'disponible')::int AS disponibles,
          pg_size_pretty(pg_relation_size('banco.unidad_sangre')) AS tabla,
          pg_size_pretty(pg_relation_size('banco.ix_unidad_disponible')) AS ix_parcial`)
    ).rows[0];
    // Combinación tipo/componente más común entre las disponibles (O+ eritrocitario).
    const { tipo, comp } = (
      await c.query(`SELECT t.id_tipo_sanguineo AS tipo, co.id_componente AS comp
                       FROM banco.tipo_sanguineo t, banco.componente co
                      WHERE t.grupo_abo = 'O' AND t.factor_rh = '+' AND co.nombre = 'Concentrado eritrocitario'`)
    ).rows[0];

    const consultas: Consulta[] = [
      {
        nombre: 'Disponibilidad de un tipo × componente',
        descripcion: 'Pantalla de inventario / validación de solicitud: existencias y próxima caducidad de O+ eritrocitario.',
        sql: `SELECT count(*), min(fecha_caducidad) FROM banco.unidad_sangre
               WHERE estado = 'disponible' AND id_tipo_sanguineo = $1 AND id_componente = $2
                 AND fecha_caducidad >= current_date`,
        params: [tipo, comp],
      },
      {
        nombre: 'Selección FEFO (5 unidades)',
        descripcion: 'Núcleo de sp_asignar_automatica: las 5 unidades disponibles que caducan primero.',
        sql: `SELECT id_unidad, fecha_caducidad FROM banco.unidad_sangre
               WHERE estado = 'disponible' AND id_tipo_sanguineo = $1 AND id_componente = $2
                 AND fecha_caducidad >= current_date
               ORDER BY fecha_caducidad LIMIT 5`,
        params: [tipo, comp],
      },
      {
        nombre: 'Tablero de disponibilidad (v_disponibilidad)',
        descripcion: 'Las 32 combinaciones tipo × componente con sus existencias.',
        sql: 'SELECT * FROM banco.v_disponibilidad',
        params: [],
      },
      {
        nombre: 'Unidades por caducar (7 días)',
        descripcion: 'Alerta del dashboard: vigentes que vencen en la próxima semana.',
        sql: `SELECT id_unidad FROM banco.unidad_sangre
               WHERE estado IN ('cuarentena', 'disponible')
                 AND fecha_caducidad BETWEEN current_date AND current_date + 7`,
        params: [],
      },
    ];

    const filas: string[] = [];
    const detalle: string[] = [];
    for (const q of consultas) {
      process.stdout.write(`  ${q.nombre}… `);
      const sin = await medir(c, q, reps, true);
      const con = await medir(c, q, reps, false);
      const mejora = ((sin.mediana - con.mediana) / sin.mediana) * 100;
      console.log(`${sin.mediana.toFixed(3)} ms → ${con.mediana.toFixed(3)} ms (${mejora.toFixed(1)} %)`);
      filas.push(
        `| ${q.nombre} | ${sin.mediana.toFixed(3)} | ${con.mediana.toFixed(3)} | **${mejora.toFixed(1)} %** | ${(sin.mediana / con.mediana).toFixed(1)}× |`,
      );
      detalle.push(
        `### ${q.nombre}\n\n${q.descripcion}\n\n\`\`\`sql\n${q.sql.replace(/^ {15}/gm, '  ')}\n\`\`\`\n\n` +
          `| | Sin índices | Con índices |\n|---|---|---|\n` +
          `| Nodo de acceso a unidad_sangre | ${sin.nodo} | ${con.nodo}${con.indice ? ` (\`${con.indice}\`)` : ''} |\n` +
          `| Mediana / mín / máx (ms) | ${sin.mediana.toFixed(3)} / ${sin.min.toFixed(3)} / ${sin.max.toFixed(3)} | ${con.mediana.toFixed(3)} / ${con.min.toFixed(3)} / ${con.max.toFixed(3)} |\n` +
          `| Buffers compartidos (hit + read) | ${sin.hit + sin.read} | ${con.hit + con.read} |\n` +
          `| Filas devueltas | ${sin.filas} | ${con.filas} |\n`,
      );
    }

    const md = `# Benchmark de índices (generado por scripts/benchmark-indices.ts)

- Fecha: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
- Servidor: ${meta.v.split(' on ')[0]} (Docker, ${process.platform} ${process.arch})
- Datos: **${meta.total.toLocaleString('es-MX')} unidades** (${meta.disponibles.toLocaleString('es-MX')} disponibles), ventana de ${dias} días. Tabla: ${meta.tabla}; índice parcial: ${meta.ix_parcial}
- Método: \`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\`, ${reps} repeticiones por configuración tras una corrida de calentamiento; se reporta la **mediana** de *Execution Time*. "Sin índices" = \`DROP INDEX\` de \`ix_unidad_disponible\` e \`ix_unidad_vigente_caducidad\` dentro de una transacción revertida.

## Resumen

| Consulta | Sin índices (ms) | Con índices (ms) | Reducción | Aceleración |
|---|---|---|---|---|
${filas.join('\n')}

## Detalle por consulta

${detalle.join('\n')}
## Interpretación

- El índice parcial \`(id_tipo_sanguineo, id_componente, fecha_caducidad) WHERE estado = 'disponible'\` contiene solo las unidades disponibles: el planificador salta directo al rango tipo × componente y, como ya viene ordenado por caducidad, FEFO se detiene en cuanto tiene 5 filas.
- Sin él, PostgreSQL debe recorrer toda la tabla (Seq Scan) y filtrar fila por fila, así que el costo crece con el histórico completo y no con el inventario vigente.
- El tablero completo (\`v_disponibilidad\`) agrega todas las disponibles; ahí la ganancia es menor porque hay que leer una fracción grande del índice. Por eso el dashboard usa además la vista materializada \`mv_dashboard\`.
`;
    const salida = path.resolve(__dirname, '..', 'docs', 'evidencias', 'benchmark.md');
    writeFileSync(salida, md);
    console.log(`Evidencia escrita en ${salida}`);
  } finally {
    await c.end();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
