import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// Presión: scale(0.97) a 160ms con ease-out fuerte (respuesta inmediata).
// Hover solo en dispositivos con puntero fino, para no "pegarse" en touch.
const boton = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'rounded-control transition-[transform,background-color,border-color,color] duration-150 ease-(--ease-out)',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variante: {
        primario: 'bg-acento text-white [@media(hover:hover)]:hover:bg-acento-hover',
        secundario:
          'border border-borde-fuerte bg-superficie text-texto [@media(hover:hover)]:hover:bg-hundido',
        fantasma: 'text-tenue [@media(hover:hover)]:hover:bg-hundido [@media(hover:hover)]:hover:text-texto',
        peligro: 'bg-peligro text-white [@media(hover:hover)]:hover:opacity-90',
      },
      tamano: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        icono: 'size-9',
      },
    },
    defaultVariants: { variante: 'secundario', tamano: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof boton> & { cargando?: boolean };

export function Button({ variante, tamano, cargando, className, children, disabled, ...props }: Props) {
  return (
    <button
      className={cn(boton({ variante, tamano }), className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
