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
}

export async function recrearBase(client: Client, database: string) {
  const db = identificadorSeguro(database);
  // WITH (FORCE) (PG13+) termina las conexiones abiertas antes de borrar.
  await client.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await client.query(
    `CREATE DATABASE ${db} OWNER ${identificadorSeguro(env.ownerUser)} ENCODING 'UTF8' TEMPLATE template0`,
  );
  // Nadie se conecta salvo que se le otorgue CONNECT explícitamente (ver 004_seguridad).
  await client.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await client.query(`ALTER DATABASE ${db} SET search_path = banco, public`);
  await client.query(`ALTER DATABASE ${db} SET timezone = 'America/Mexico_City'`);
}
