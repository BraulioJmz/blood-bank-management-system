import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { claseControl } from './estilos';

/** Select nativo con estilo: accesible y con el selector del sistema en móvil. */
export function Select({
  etiqueta,
  children,
  className,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
  const autoId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id ?? autoId} className="text-sm font-medium">
        {etiqueta}
      </label>
      <select id={id ?? autoId} className={cn(claseControl, 'h-10 pr-8', className)} {...props}>
        {children}
      </select>
    </div>
  );
}

export function AreaTexto({
  etiqueta,
  error,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { etiqueta: string; error?: string }) {
  const autoId = useId();
  const tid = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={tid} className="text-sm font-medium">
        {etiqueta}
      </label>
      <textarea
        id={tid}
        aria-invalid={error ? true : undefined}
        className={cn(claseControl, 'min-h-20 py-2')}
        {...props}
      />
      {error && <p className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
