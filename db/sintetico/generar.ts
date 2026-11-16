/**
 * db:sintetico — genera datos de volumen sobre la BD ya migrada y sembrada.
 *   npm run db:sintetico -- --unidades 100000 [--dias 400] [--db banco]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clienteOwner, env } from '../lib/config';

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

/** Nombres de donantes. */
function generarNombres(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Donante sintético ${i + 1}`);
}

export async function generar(database: string, unidades: number, dias: number) {
  const donantes = Math.max(10, Math.ceil(unidades / 2.7 / 2));
  const client = clienteOwner(database);
  await client.connect();
  const t0 = Date.now();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('sintetico.unidades', $1, true), set_config('sintetico.dias', $2, true)", [
      String(unidades),
      String(dias),
    ]);
    await client.query('CREATE TEMP TABLE tmp_nombres (n integer, nombre text) ON COMMIT DROP');
    // Un solo INSERT con arreglos como parámetros: unnest los convierte en filas.
    const nombres = generarNombres(donantes);
    await client.query('INSERT INTO tmp_nombres SELECT * FROM unnest($1::int[], $2::text[])', [
      nombres.map((_, i) => i + 1),
      nombres,
    ]);
    await client.query(readFileSync(path.join(__dirname, 'generar.sql'), 'utf8'));
    await client.query('COMMIT');
    // ANALYZE actualiza las estadísticas del planificador tras la carga masiva; sin él,
    // los planes (y el benchmark) se basarían en estimaciones de tablas casi vacías.
    await client.query('ANALYZE');
    const { rows } = await client.query(
      'SELECT estado, count(*)::int AS n FROM banco.unidad_sangre GROUP BY estado ORDER BY estado',
    );
    console.log(`Generado en ${((Date.now() - t0) / 1000).toFixed(1)} s (${donantes} donantes):`);
    console.table(rows);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const unidades = Number(arg('unidades', '5000'));
  const dias = Number(arg('dias', '400'));
  const db = arg('db', env.dbName);
  console.log(`Generando ≈${unidades} unidades en ${db} (ventana ${dias} días)…`);
  generar(db, unidades, dias).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
