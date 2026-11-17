import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import type { Tono } from './tonos';

const insignia = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
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
  },
);

export function Badge({ tono, children }: { tono?: Tono; children: ReactNode }) {
  return <span className={insignia({ tono })}>{children}</span>;
}
