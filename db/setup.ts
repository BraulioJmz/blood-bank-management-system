/**
 * db:setup — inicialización IDEMPOTENTE (la usa el servicio `migrador` de docker-compose.prod.yml).
 * A diferencia de db:reset, nunca borra datos; se puede correr en cada despliegue:
 *   1. asegura los roles (crea los que falten y reaplica atributos y contraseñas);
 *   2. crea la base si no existe;
 *   3. aplica solo las migraciones pendientes (checksum: falla si alguien editó una aplicada);
 *   4. siembra hospitales y usuarios demo solo si la tabla usuario está vacía;
 *   5. con SINTETICO_UNIDADES > 0, carga datos sintéticos solo si no hay donantes.
 */
import { asegurarBase, bootstrapRoles } from './lib/bootstrap';
import { clienteOwner, clienteSuper, env } from './lib/config';
import { migrar } from './migrate';
import { sembrar } from './seeds';
import { generar } from './sintetico/generar';

async function contar(database: string, tabla: 'usuario' | 'donante'): Promise<number> {
  const c = clienteOwner(database);
  await c.connect();
  try {
    const { rows } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM banco.${tabla}`);
    return rows[0].n;
  } finally {
    await c.end();
  }
}

export async function preparar(database = env.dbName, log = console.log) {
  const sup = clienteSuper();
  await sup.connect();
  let creada: boolean;
  try {
    await bootstrapRoles(sup);
    creada = await asegurarBase(sup, database);
  } finally {
    await sup.end();
  }
  log(creada ? `Base ${database} creada.` : `Base ${database} ya existía.`);
  const aplicadas = await migrar(database, log);
  log(aplicadas.length ? `${aplicadas.length} migraciones aplicadas.` : 'Sin migraciones pendientes.');
  if ((await contar(database, 'usuario')) === 0) await sembrar(database, log);
  else log('Seeds omitidos: ya hay usuarios.');
  const unidades = Number(process.env.SINTETICO_UNIDADES ?? 0);
  if (unidades > 0 && (await contar(database, 'donante')) === 0) {
    log(`Cargando ≈${unidades} unidades sintéticas…`);
    await generar(database, unidades, 400);
  }
}

if (require.main === module) {
  preparar()
    .then(() => console.log('Listo.'))
    .catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
}
