import { cn } from '../../lib/cn';

/** Unidades asignadas / solicitadas. Texto + barra (la barra sola no basta). */
export function Progreso({ asignadas, cantidad }: { asignadas: number; cantidad: number }) {
  const pct = cantidad > 0 ? Math.min(100, (asignadas / cantidad) * 100) : 0;
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-hundido"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cantidad}
        aria-valuenow={asignadas}
        aria-label="Unidades asignadas"
      >
        <div
          className={cn('h-full rounded-full', pct >= 100 ? 'bg-ok' : 'bg-info')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="cifras text-xs whitespace-nowrap text-tenue">
        {asignadas}/{cantidad}
      </span>
    </div>
  );
}
