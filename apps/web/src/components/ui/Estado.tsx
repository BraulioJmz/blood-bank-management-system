import { AlertCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-tenue" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

export function ErrorCarga({ error, children }: { error: unknown; children?: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-control bg-peligro-suave p-3 text-sm text-peligro"
      role="alert"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p>{error instanceof Error ? error.message : 'No se pudo cargar la información.'}</p>
        {children}
      </div>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-tenue">{children}</p>;
}
