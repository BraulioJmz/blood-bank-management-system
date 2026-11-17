import { cn } from '../../lib/cn';

/** Filtro segmentado (radiogroup). Sin animación: se cambia muchas veces seguidas. */
export function Segmentos<T extends string>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  alCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="inline-flex w-fit max-w-full self-start overflow-x-auto rounded-control bg-hundido p-1"
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => alCambiar(o.valor)}
          className={cn(
            'h-8 rounded-[calc(var(--radius-control)-2px)] px-3 text-sm whitespace-nowrap',
            valor === o.valor ? 'bg-superficie font-medium shadow-tarjeta' : 'text-tenue hover:text-texto',
          )}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
