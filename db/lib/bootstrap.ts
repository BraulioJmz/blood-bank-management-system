/**
 * Bootstrap a nivel clúster (corre como superusuario `postgres`).
 *
 * Los ROLES en PostgreSQL son objetos globales del clúster (no pertenecen a una BD),
 * por eso se crean aquí y no dentro de una migración: así `banco` y `banco_test`
 * comparten los mismos roles y las migraciones pueden correr con un dueño sin
 * privilegio CREATEROLE.
 */
import { Client } from 'pg';
import { env, identificadorSeguro } from './config';

/** Lista blanca de roles de grupo (la misma que valida DbService.withContext). */
export const ROLES_APP = ['rol_recepcion', 'rol_laboratorio', 'rol_inventario', 'rol_hospital', 'rol_admin'] as const;

async function asegurarRol(client: Client, nombre: string, atributos: string, password?: string) {
  const id = identificadorSeguro(nombre);
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [nombre]);
  if (!rowCount) await client.query(`CREATE ROLE ${id}`);
  // ALTER siempre: deja los atributos en el estado esperado aunque el rol ya existiera.
  // Las contraseñas tampoco se pueden parametrizar; escapeLiteral las cita de forma segura.
  // Con password_encryption = scram-sha-256 (default en PG16) se guarda el verificador SCRAM, no el texto.
  const pass = password ? ` PASSWORD ${client.escapeLiteral(password)}` : '';
  await client.query(`ALTER ROLE ${id} ${atributos}${pass}`);
}

export async function bootstrapRoles(client: Client) {
  // Dueño de los objetos: NO superusuario. Las funciones SECURITY DEFINER corren con
  // sus privilegios, así que conviene que sean los mínimos necesarios.
  await asegurarRol(
    client,
    env.ownerUser,
    'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
    env.ownerPassword(),
  );

  // Roles de grupo NOLOGIN: agrupan privilegios; nadie inicia sesión con ellos.
  for (const rol of ROLES_APP) {
    await asegurarRol(client, rol, 'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
  }

  // app_login: la única cuenta con la que se conecta la API. NOINHERIT + membresía
  // con INHERIT FALSE (sintaxis PG16): NO hereda los privilegios de los roles de
  // grupo; con SET TRUE solo puede "ponérselos" con SET ROLE. Así, si una petición
  // olvidara el SET LOCAL ROLE, la conexión no podría leer ni escribir nada.
  await asegurarRol(
    client,
    env.appUser,
    'LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 50',
    env.appPassword(),
  );
  for (const rol of ROLES_APP) {
    await client.query(
      `GRANT ${identificadorSeguro(rol)} TO ${identificadorSeguro(env.appUser)} WITH INHERIT FALSE, SET TRUE`,
    );
  }
}

export async function recrearBase(client: Client, database: string) {
  // WITH (FORCE) (PG13+) termina las conexiones abiertas antes de borrar.
  await client.query(`DROP DATABASE IF EXISTS ${identificadorSeguro(database)} WITH (FORCE)`);
  await crearBase(client, database);
}

/** Crea la base si no existe. Devuelve true si la creó (para decidir si sembrar). */
export async function asegurarBase(client: Client, database: string): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (rowCount) return false;
  await crearBase(client, database);
  return true;
}

async function crearBase(client: Client, database: string) {
  const db = identificadorSeguro(database);
  await client.query(
    `CREATE DATABASE ${db} OWNER ${identificadorSeguro(env.ownerUser)} ENCODING 'UTF8' TEMPLATE template0`,
  );
  // Nadie se conecta salvo que se le otorgue CONNECT explícitamente (ver 004_seguridad).
  await client.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await client.query(`ALTER DATABASE ${db} SET search_path = banco, public`);
  await client.query(`ALTER DATABASE ${db} SET timezone = 'America/Mexico_City'`);
}
