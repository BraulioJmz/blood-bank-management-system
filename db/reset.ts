/**
 * db:reset — drop + bootstrap de roles + migraciones + seeds.
 * Por defecto reinicia la BD de desarrollo y la de pruebas.
 *   npm run db:reset                 # banco y banco_test
 *   npm run db:reset -- --db banco   # solo una
 */
import { bootstrapRoles, recrearBase } from './lib/bootstrap';
import { clienteSuper, env } from './lib/config';
import { migrar } from './migrate';
import { sembrar } from './seeds';

export async function resetear(database: string, log = console.log) {
  const sup = clienteSuper();
  await sup.connect();
  try {
    await bootstrapRoles(sup);
    await recrearBase(sup, database);
  } finally {
    await sup.end();
  }
  await migrar(database, log);
  await sembrar(database, log);
}

if (require.main === module) {
  const idx = process.argv.indexOf('--db');
  const bases = idx > 0 ? [process.argv[idx + 1]] : [env.dbName, env.dbTestName];
  (async () => {
    for (const b of bases) {
      console.log(`Reiniciando ${b}…`);
      await resetear(b);
    }
    console.log('Listo.');
  })().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
