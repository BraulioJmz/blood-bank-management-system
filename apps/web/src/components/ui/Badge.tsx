import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

const insignia = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tono: {
      neutro: 'bg-hundido text-tenue',
      ok: 'bg-ok-suave text-ok',
      aviso: 'bg-aviso-suave text-aviso',
      peligro: 'bg-peligro-suave text-peligro',
      info: 'bg-info-suave text-info',
    },
  },
  defaultVariants: { tono: 'neutro' },
});

export type Tono = NonNullable<VariantProps<typeof insignia>['tono']>;

export function Badge({ tono, children }: { tono?: Tono; children: ReactNode }) {
  return <span className={insignia({ tono })}>{children}</span>;
}

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
