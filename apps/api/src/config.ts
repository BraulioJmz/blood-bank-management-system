import { config as cargarEnv } from 'dotenv';
import path from 'node:path';

// .env de la raíz del monorepo (en Docker las variables llegan por el entorno).
cargarEnv({
  path: path.resolve(__dirname, '..', '..', '..', '.env'),
  quiet: true,
});

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export const config = {
  puerto: Number(process.env.API_PORT ?? 3000),
  corsOrigen: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'banco',
    user: process.env.DB_APP_USER ?? 'app_login',
    password: () => requerida('DB_APP_PASSWORD'),
  },
  jwt: {
    secreto: () => requerida('JWT_SECRET'),
    expira: process.env.JWT_EXPIRES_IN ?? '8h',
  },
};
