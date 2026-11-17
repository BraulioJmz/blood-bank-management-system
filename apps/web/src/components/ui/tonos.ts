export type Tono = 'neutro' | 'ok' | 'aviso' | 'peligro' | 'info';

/** Tono por estado de unidad_sangre (CHECK de 001_esquema.sql). */
export const TONO_ESTADO_UNIDAD: Record<string, Tono> = {
  cuarentena: 'aviso',
  disponible: 'ok',
  asignada: 'info',
  entregada: 'neutro',
  caducada: 'peligro',
  descartada: 'peligro',
};

export const TONO_PRIORIDAD: Record<string, Tono> = {
  normal: 'neutro',
  urgente: 'aviso',
  emergencia: 'peligro',
};
