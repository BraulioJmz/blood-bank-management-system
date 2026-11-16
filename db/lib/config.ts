import { config as cargarEnv } from 'dotenv';
import path from 'node:path';
import { Client, ClientConfig } from 'pg';

// Carga el .env de la raíz del monorepo sin importar desde dónde se ejecute.
cargarEnv({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} (revisa .env)`);
  return valor;
}

export const env = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  dbName: process.env.DB_NAME ?? 'banco',
  dbTestName: process.env.DB_TEST_NAME ?? 'banco_test',
  superPassword: () => requerida('POSTGRES_PASSWORD'),
  ownerUser: process.env.DB_OWNER_USER ?? 'banco_owner',
  ownerPassword: () => requerida('DB_OWNER_PASSWORD'),
  appUser: process.env.DB_APP_USER ?? 'app_login',
  appPassword: () => requerida('DB_APP_PASSWORD'),
};

const base = (): Pick<ClientConfig, 'host' | 'port'> => ({ host: env.host, port: env.port });

/** Superusuario: solo para bootstrap (roles cluster-wide y CREATE/DROP DATABASE). */
export const clienteSuper = (database = 'postgres') =>
  new Client({ ...base(), user: 'postgres', password: env.superPassword(), database });

/** Dueño del esquema `banco`: corre las migraciones. */
export const clienteOwner = (database: string) =>
  new Client({ ...base(), user: env.ownerUser, password: env.ownerPassword(), database });

/** Identificadores (nombres de rol/BD) no se pueden parametrizar: lista blanca + comillas. */
export function identificadorSeguro(nombre: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nombre)) throw new Error(`Identificador inválido: ${nombre}`);
  return `"${nombre}"`;
}
