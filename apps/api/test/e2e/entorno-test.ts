/**
 * Debe ser el PRIMER import del spec e2e: los import de ES se evalúan en orden, y
 * src/config.ts lee DB_NAME al cargarse. Así la app Nest de la prueba se conecta a
 * banco_test y nunca a la BD de desarrollo. (dotenv no pisa variables ya definidas.)
 */
import { config as cargarEnv } from 'dotenv';
import path from 'node:path';

cargarEnv({
  path: path.resolve(__dirname, '..', '..', '..', '..', '.env'),
  quiet: true,
});
process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'banco_test';
