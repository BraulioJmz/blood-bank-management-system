import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';

const OPCIONES = [
  ['', 'Demo'],
  ['peor', 'Peor caso'],
  ['vacio', 'Vacío'],
  ['uno', 'Uno'],
] as const;

/** break-ui: interruptor de datos, solo en desarrollo. Cromo neutro, sin animación. */
export function InterruptorDatos() {
  const { search, pathname } = useLocation();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const actual = new URLSearchParams(search).get('datos') ?? '';
  return (
    <div
      role="radiogroup"
      aria-label="Datos de prueba (dev)"
      style={{ fontFamily: 'system-ui', zIndex: 60 }}
      className="fixed bottom-3 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-neutral-200 p-0.5 text-xs shadow"
    >
      {OPCIONES.map(([v, etiqueta]) => (
        <button
          key={v}
          role="radio"
          aria-checked={actual === v}
          onClick={() => {
            navegar(v ? `${pathname}?datos=${v}` : pathname, { replace: true });
            void qc.resetQueries();
          }}
          className={`rounded-full px-3 py-1 whitespace-nowrap ${actual === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600'}`}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
