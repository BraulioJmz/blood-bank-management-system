import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-tarjeta bg-superficie shadow-tarjeta', className)} {...props} />;
}

export function CardHeader({
  titulo,
  accion,
  descripcion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-borde px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-sm text-tenue">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
