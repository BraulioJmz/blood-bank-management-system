import { Check, Clock, X } from 'lucide-react';
import type { ResultadoPrueba } from '../../api/tipos';
import { cn } from '../../lib/cn';

export const PRUEBAS = ['VIH', 'VHB', 'VHC', 'Sifilis', 'Chagas'] as const;

const ICONO = { pendiente: Clock, no_reactivo: Check, reactivo: X };
const TEXTO = { pendiente: 'pendiente', no_reactivo: 'no reactivo', reactivo: 'reactivo' };

/** Resumen compacto de las 5 pruebas: ícono + nombre (el color nunca va solo). */
export function ResumenTamizaje({ pruebas }: { pruebas: Record<string, ResultadoPrueba> | null }) {
  if (!pruebas) return <span className="text-tenue">—</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Pruebas de tamizaje">
      {PRUEBAS.filter((p) => pruebas[p]).map((prueba) => {
        const r = pruebas[prueba];
        const Icono = ICONO[r];
        return (
          <li
            key={prueba}
            title={`${prueba}: ${TEXTO[r]}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs',
              r === 'pendiente' && 'bg-hundido text-tenue',
              r === 'no_reactivo' && 'bg-ok-suave text-ok',
              r === 'reactivo' && 'bg-peligro-suave font-medium text-peligro',
            )}
          >
            <Icono className="size-3" aria-hidden />
            {prueba}
            <span className="sr-only">: {TEXTO[r]}</span>
          </li>
        );
      })}
    </ul>
  );
}
