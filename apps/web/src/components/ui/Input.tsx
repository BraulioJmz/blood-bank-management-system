import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

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
        className={cn(
          'h-10 rounded-control border border-borde-fuerte bg-superficie px-3 text-sm',
          'transition-[border-color,box-shadow] duration-150 ease-(--ease-out)',
          'placeholder:text-tenue focus:border-info focus:outline-none focus:ring-3 focus:ring-info/15',
          'aria-invalid:border-peligro',
          className,
        )}
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
