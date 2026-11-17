/**
 * db:reset — drop + bootstrap de roles + migraciones + seeds.
 * Por defecto reinicia la BD de desarrollo y la de pruebas, y carga datos sintéticos
 * (5 000 unidades) SOLO en la de desarrollo, para que la web tenga datos al levantarla.
 * banco_test queda vacía: las pruebas crean sus propios datos.
 *   npm run db:reset                         # banco (+ sintéticos) y banco_test
 *   npm run db:reset -- --db banco_test      # solo una (sin sintéticos si no es la de desarrollo)
 *   npm run db:reset -- --sin-sintetico      # sin datos sintéticos
 *   npm run db:reset -- --unidades 100000    # más volumen en desarrollo
 */
import { bootstrapRoles, recrearBase } from './lib/bootstrap';
import { clienteSuper, env } from './lib/config';
import { migrar } from './migrate';
import { sembrar } from './seeds';
import { generar } from './sintetico/generar';

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
  const iu = process.argv.indexOf('--unidades');
  const unidades = iu > 0 ? Number(process.argv[iu + 1]) : 5000;
  const conSintetico = !process.argv.includes('--sin-sintetico');
  (async () => {
    for (const b of bases) {
      console.log(`Reiniciando ${b}…`);
      await resetear(b);
      if (conSintetico && b === env.dbName) {
        console.log(`Cargando ≈${unidades} unidades sintéticas en ${b}…`);
        await generar(b, unidades, 400);
      }
    }
    console.log('Listo.');
  })().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
