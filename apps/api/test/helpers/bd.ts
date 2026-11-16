/**
 * Utilidades para pruebas contra la BD real `banco_test`.
 * - poolApp: se conecta como app_login (igual que la API).
 * - owner/superusuario: solo para preparar escenarios (p. ej. forzar una caducidad).
 */
import { config as cargarEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client, Pool, PoolClient } from 'pg';
import {
  ContextoUsuario,
  ejecutarConContexto,
  RolApp,
} from '../../src/db/contexto';

cargarEnv({
  path: path.resolve(__dirname, '..', '..', '..', '..', '.env'),
  quiet: true,
});

export const DB_TEST = process.env.DB_TEST_NAME ?? 'banco_test';
/** Solo `npm run test:evidencia` (EVIDENCIA=1) reescribe docs/evidencias/. */
export function guardarEvidencia(archivo: string, contenido: string) {
  if (process.env.EVIDENCIA !== '1') return;
  mkdirSync(EVIDENCIAS, { recursive: true });
  writeFileSync(path.join(EVIDENCIAS, archivo), contenido);
}

export const EVIDENCIAS = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'evidencias',
);

const base = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: DB_TEST,
};

export const crearPoolApp = (max = 30) =>
  new Pool({
    ...base,
    user: process.env.DB_APP_USER ?? 'app_login',
    password: process.env.DB_APP_PASSWORD,
    max,
  });

export async function conOwner<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({
    ...base,
    user: process.env.DB_OWNER_USER ?? 'banco_owner',
    password: process.env.DB_OWNER_PASSWORD,
  });
  await c.connect();
  try {
    await c.query('SET search_path = banco, public');
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function conSuper<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({
    ...base,
    user: 'postgres',
    password: process.env.POSTGRES_PASSWORD,
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Contexto de un usuario demo (seeds) por username. */
export async function contextoDe(
  pool: Pool,
  username: string,
): Promise<ContextoUsuario> {
  const { rows } = await pool.query<{
    id_usuario: number;
    rol: RolApp;
    id_hospital: number | null;
  }>(
    'SELECT id_usuario, rol, id_hospital FROM banco.fn_credenciales_login($1)',
    [username],
  );
  if (!rows[0]) throw new Error(`No existe el usuario demo ${username}`);
  return {
    idUsuario: rows[0].id_usuario,
    rol: rows[0].rol,
    idHospital: rows[0].id_hospital,
  };
}

export interface Usuarios {
  recepcion: ContextoUsuario;
  laboratorio: ContextoUsuario;
  inventario: ContextoUsuario;
  norte: ContextoUsuario;
  sur: ContextoUsuario;
  admin: ContextoUsuario;
}

export async function usuariosDemo(pool: Pool): Promise<Usuarios> {
  return {
    recepcion: await contextoDe(pool, 'recepcion'),
    laboratorio: await contextoDe(pool, 'laboratorio'),
    inventario: await contextoDe(pool, 'inventario'),
    norte: await contextoDe(pool, 'hospital.norte'),
    sur: await contextoDe(pool, 'hospital.sur'),
    admin: await contextoDe(pool, 'admin'),
  };
}

export const como = <T>(
  pool: Pool,
  ctx: ContextoUsuario,
  fn: (c: PoolClient) => Promise<T>,
) => ejecutarConContexto(pool, ctx, fn);

export async function idTipo(etiqueta: string): Promise<number> {
  const { rows } = await conOwner((c) =>
    c.query<{ id: number }>(
      'SELECT id_tipo_sanguineo AS id FROM tipo_sanguineo WHERE grupo_abo || factor_rh = $1',
      [etiqueta],
    ),
  );
  return rows[0].id;
}

export async function idComponente(nombre: string): Promise<number> {
  const { rows } = await conOwner((c) =>
    c.query<{ id: number }>(
      'SELECT id_componente AS id FROM componente WHERE nombre = $1',
      [nombre],
    ),
  );
  return rows[0].id;
}

export const ERITRO = 'Concentrado eritrocitario';
export const PLASMA = 'Plasma fresco congelado';
export const PLAQUETAS = 'Concentrado plaquetario';

type Resultado = 'no_reactivo' | 'reactivo' | 'pendiente';

/**
 * Flujo real por roles: recepción registra donante y donación, laboratorio fracciona
 * y captura los 5 resultados. Devuelve los id_unidad creados.
 */
export async function crearDonacion(
  pool: Pool,
  u: Usuarios,
  opts: {
    tipo: number;
    componentes: number[];
    resultados?: Partial<Record<string, Resultado>>;
    todas?: Resultado;
  },
): Promise<{ idDonacion: number; unidades: number[] }> {
  const idDonacion = await como(pool, u.recepcion, async (c) => {
    const d = await c.query<{ id_donante: number }>(
      `INSERT INTO banco.donante (nombre, fecha_nacimiento, sexo, id_tipo_sanguineo)
       VALUES ('Donante de prueba', DATE '1990-05-10', 'F', $1) RETURNING id_donante`,
      [opts.tipo],
    );
    const r = await c.query<{ id_donacion: number }>(
      `INSERT INTO banco.donacion (id_donante, tipo_donacion, volumen_ml)
       VALUES ($1, 'altruista', 450) RETURNING id_donacion`,
      [d.rows[0].id_donante],
    );
    return r.rows[0].id_donacion;
  });
  const unidades = await como(pool, u.laboratorio, async (c) => {
    const r = await c.query<{ id_unidad: number }>(
      'SELECT id_unidad FROM banco.fn_fraccionar_donacion($1, $2::int[])',
      [idDonacion, opts.componentes],
    );
    return r.rows.map((x) => x.id_unidad);
  });
  const todas = opts.todas ?? 'no_reactivo';
  for (const tipo of ['VIH', 'VHB', 'VHC', 'Sifilis', 'Chagas']) {
    const res = opts.resultados?.[tipo] ?? todas;
    if (res === 'pendiente') continue;
    await como(pool, u.laboratorio, (c) =>
      c.query(
        `UPDATE banco.prueba_tamizaje SET resultado = $1
          WHERE id_donacion = $2 AND tipo_prueba = $3`,
        [res, idDonacion, tipo],
      ),
    );
  }
  return { idDonacion, unidades };
}

export async function crearSolicitud(
  pool: Pool,
  hospital: ContextoUsuario,
  tipo: number,
  componente: number,
  cantidad = 1,
): Promise<number> {
  return como(pool, hospital, async (c) => {
    const r = await c.query<{ id_solicitud: number }>(
      `INSERT INTO banco.solicitud (id_hospital, id_tipo_sanguineo, id_componente, cantidad)
       VALUES ($1, $2, $3, $4) RETURNING id_solicitud`,
      [hospital.idHospital, tipo, componente, cantidad],
    );
    return r.rows[0].id_solicitud;
  });
}

export const asignar = (
  pool: Pool,
  ctx: ContextoUsuario,
  idSolicitud: number,
  idUnidad: number,
) =>
  como(pool, ctx, (c) =>
    c.query('CALL banco.sp_asignar_unidad($1, $2, NULL)', [
      idSolicitud,
      idUnidad,
    ]),
  );

/** Código SQLSTATE de un error de pg (o undefined). */
export const sqlstate = (e: unknown): string | undefined =>
  (e as { code?: string })?.code;

export async function estadoUnidad(id: number): Promise<string> {
  const { rows } = await conOwner((c) =>
    c.query<{ estado: string }>(
      'SELECT estado FROM unidad_sangre WHERE id_unidad = $1',
      [id],
    ),
  );
  return rows[0].estado;
}
