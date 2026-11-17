import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { claseControl } from './estilos';

type Props = InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string };

export function Input({ etiqueta, error, className, id, ...props }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(claseControl, 'h-10', className)}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
