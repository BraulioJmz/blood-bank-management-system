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

/** Semáforo de caducidad de v_inventario_unidades (umbral relativo al componente, migración 007). */
export const TONO_SEMAFORO: Record<string, Tono> = { rojo: 'peligro', amarillo: 'aviso', verde: 'ok' };
