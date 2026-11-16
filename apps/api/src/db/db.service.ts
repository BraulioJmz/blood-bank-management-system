import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { ContextoUsuario, ejecutarConContexto } from './contexto';

@Injectable()
export class DbService implements OnModuleDestroy {
  /** Un solo Pool por proceso, conectado como app_login (sin privilegios propios). */
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password(),
      max: 20,
      // Ninguna sentencia puede colgar una conexión del pool indefinidamente
      // (p. ej. esperando un candado): se cancela a los 10 s.
      statement_timeout: 10_000,
      application_name: 'banco-sangre-api',
    });
  }

  /** Toda operación de negocio pasa por aquí: transacción + rol + identidad. */
  withContext<T>(
    usuario: ContextoUsuario,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return ejecutarConContexto(this.pool, usuario, fn);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
