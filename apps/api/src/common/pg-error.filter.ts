import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseError } from 'pg';
import { ContextoInvalidoError } from '../db/contexto';

/**
 * SQLSTATE propios (003_logica.sql) → HTTP. El mensaje del RAISE ya está en
 * español y redactado para el usuario, así que se pasa tal cual.
 */
const PROPIOS: Record<string, number> = {
  BS001: 409, // unidad no disponible
  BS002: 422, // caducada
  BS003: 422, // otro tipo sanguíneo
  BS004: 422, // otro componente
  BS005: 409, // solicitud cerrada
  BS006: 422, // cuarentena
  BS007: 404, // no encontrado
  BS008: 422, // edad del donante
  BS009: 422, // fraccionamiento inválido
  BS010: 409, // transición inválida
  BS011: 409, // sin unidades compatibles
  BS012: 422, // descartada
  BS013: 409, // bitácora inmodificable
  BS014: 409, // resultado ya capturado
  BS015: 401, // sin contexto de usuario
  BS016: 422, // usuario/hospital inconsistente
};

/** Errores estándar de PostgreSQL más comunes, con mensaje accionable. */
const ESTANDAR: Record<string, [number, string]> = {
  '23505': [409, 'Ya existe un registro con esos datos'],
  '23503': [422, 'Hace referencia a un registro que no existe'],
  '23514': [422, 'Algún valor no cumple las reglas permitidas'],
  '23502': [422, 'Falta un dato obligatorio'],
  '22P02': [400, 'Algún valor tiene un formato inválido'],
  '22007': [400, 'Fecha con formato inválido'],
  '22008': [400, 'Fecha fuera de rango'],
  '42501': [403, 'Tu rol no tiene permiso para esta operación'],
  '57014': [503, 'La operación tardó demasiado; inténtalo de nuevo'],
  '40P01': [409, 'Conflicto con otra operación simultánea; inténtalo de nuevo'],
};

@Catch()
export class PgErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('PgErrorFilter');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof HttpException) {
      res.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof ContextoInvalidoError) {
      res
        .status(HttpStatus.FORBIDDEN)
        .json({ statusCode: 403, message: error.message });
      return;
    }
    if (error instanceof DatabaseError && error.code) {
      if (error.code in PROPIOS) {
        const status = PROPIOS[error.code];
        res.status(status).json({
          statusCode: status,
          codigo: error.code,
          message: error.message,
        });
        return;
      }
      const [status, message] = ESTANDAR[error.code] ?? [];
      if (status) {
        // El detalle técnico (constraint, columna) va al log, no al usuario.
        this.log.warn(
          `${error.code} ${error.message} [${error.constraint ?? ''}]`,
        );
        res.status(status).json({
          statusCode: status,
          codigo: error.code,
          message,
          restriccion: error.constraint,
        });
        return;
      }
    }
    this.log.error(error);
    res.status(500).json({ statusCode: 500, message: 'Error interno' });
  }
}
