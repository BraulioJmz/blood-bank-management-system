import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
    // Un cliente INACTIVO del pool puede perder su conexión (reinicio de PostgreSQL,
    // pg_terminate_backend, DROP DATABASE en db:reset). pg lo descarta solo, pero emite
    // 'error' en el Pool y, sin listener, Node termina el proceso. Se registra y sigue:
    // la siguiente petición abre una conexión nueva.
    this.pool.on('error', (e) =>
      this.log.warn(`Conexión inactiva perdida: ${e.message}`),
    );
  }

  private readonly log = new Logger(DbService.name);

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
