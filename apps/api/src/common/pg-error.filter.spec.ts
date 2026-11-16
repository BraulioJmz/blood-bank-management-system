import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { ContextoInvalidoError } from '../db/contexto';
import { PgErrorFilter } from './pg-error.filter';

function ejecutar(error: unknown) {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new PgErrorFilter().catch(error, host);
  return {
    status: res.status.mock.calls[0][0],
    cuerpo: res.json.mock.calls[0][0],
  };
}

const pgError = (code: string, message = 'mensaje') =>
  Object.assign(new DatabaseError(message, 0, 'error'), { code });

describe('PgErrorFilter', () => {
  it.each([
    ['BS001', 409],
    ['BS002', 422],
    ['BS007', 404],
    ['BS015', 401],
  ])('traduce %s a %i con el mensaje del RAISE', (code, status) => {
    const r = ejecutar(pgError(code, 'La unidad 7 está caducada'));
    expect(r.status).toBe(status);
    expect(r.cuerpo).toMatchObject({
      codigo: code,
      message: 'La unidad 7 está caducada',
    });
  });

  it('traduce 42501 (permiso denegado) a 403 sin exponer el detalle técnico', () => {
    const r = ejecutar(pgError('42501', 'permission denied for table donante'));
    expect(r.status).toBe(403);
    expect(r.cuerpo.message).not.toContain('donante');
  });

  it('traduce 23505 (unique_violation) a 409', () => {
    expect(ejecutar(pgError('23505')).status).toBe(409);
  });

  it('respeta las HttpException de Nest', () => {
    expect(ejecutar(new NotFoundException('x')).status).toBe(404);
  });

  it('un rol fuera de la lista blanca es 403', () => {
    expect(ejecutar(new ContextoInvalidoError('rol')).status).toBe(403);
  });

  it('cualquier otro error es 500 genérico', () => {
    const r = ejecutar(new Error('detalle interno'));
    expect(r.status).toBe(500);
    expect(r.cuerpo.message).toBe('Error interno');
  });
});
