/**
 * Runner mínimo de migraciones.
 *
 * - Aplica en orden los archivos `db/migrations/NNN_*.sql` que no estén en `schema_migrations`.
 * - Cada archivo corre en su propia transacción: PostgreSQL tiene DDL transaccional,
 *   así que si una sentencia falla, el archivo completo se revierte (incluidos CREATE TABLE)
 *   y la BD nunca queda "a medias".
 * - Guarda un checksum SHA-256 para detectar migraciones ya aplicadas que se editaron.
 * - Corre como `banco_owner` (dueño de los objetos), nunca como superusuario.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clienteOwner, env } from './lib/config';

const DIR = path.join(__dirname, 'migrations');

export async function migrar(database: string = env.dbName, log = console.log): Promise<string[]> {
  const client = clienteOwner(database);
  await client.connect();
  const aplicadas: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version     varchar(255) PRIMARY KEY,
        checksum    char(64)     NOT NULL,
        aplicada_en timestamptz  NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM public.schema_migrations',
    );
    const hechas = new Map(rows.map((r) => [r.version, r.checksum]));

    const archivos = readdirSync(DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    for (const archivo of archivos) {
      const sql = readFileSync(path.join(DIR, archivo), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previo = hechas.get(archivo);
      if (previo) {
        if (previo !== checksum) {
          throw new Error(`La migración ${archivo} ya aplicada fue modificada. Crea una nueva o usa db:reset.`);
        }
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL search_path = banco, public');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)', [
          archivo,
          checksum,
        ]);
        await client.query('COMMIT');
        aplicadas.push(archivo);
        log(`  ✔ ${archivo}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Falló ${archivo}: ${(e as Error).message}`);
      }
    }
    if (aplicadas.length === 0) log('  (sin migraciones pendientes)');
    return aplicadas;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const idx = process.argv.indexOf('--db');
  const database = idx > 0 ? process.argv[idx + 1] : env.dbName;
  console.log(`Migrando ${database}…`);
  migrar(database).catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
