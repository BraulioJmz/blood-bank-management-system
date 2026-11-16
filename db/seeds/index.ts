/**
 * Seeds: aplica en orden los `db/seeds/*.sql` (como banco_owner, en una transacción).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clienteOwner } from '../lib/config';

export async function sembrar(database: string, log = console.log) {
  const archivos = readdirSync(__dirname).filter((f) => f.endsWith('.sql')).sort();
  if (archivos.length === 0) return;
  const client = clienteOwner(database);
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const archivo of archivos) {
      await client.query(readFileSync(path.join(__dirname, archivo), 'utf8'));
      log(`  ✔ seed ${archivo}`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}
