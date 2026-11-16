import { Controller, Get } from '@nestjs/common';
import { DbService } from './db/db.service';

@Controller('salud')
export class SaludController {
  constructor(private readonly db: DbService) {}

  /** Verifica que la API llega a PostgreSQL (sin datos de negocio). */
  @Get()
  async salud() {
    const { rows } = await this.db.pool.query<{ ahora: string }>(
      'SELECT now() AS ahora',
    );
    return { estado: 'ok', bd: rows[0].ahora };
  }
}
