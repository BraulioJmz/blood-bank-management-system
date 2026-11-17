import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

/**
 * Diálogo modal (Base UI: foco atrapado, Esc y clic fuera cierran, aria-modal).
 * Centrado, así que escala desde el centro (los modales no son origin-aware).
 * Entra desde scale(0.96)+opacity 0 en 200ms ease-out; sale más rápido (150ms).
 */
export function Dialogo({
  abierto,
  alCambiar,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 'md',
}: {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  pie?: ReactNode;
  ancho?: 'md' | 'lg';
}) {
  return (
    <Dialog.Root open={abierto} onOpenChange={alCambiar}>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            'fixed inset-0 z-40 bg-texto/30 transition-opacity duration-200 ease-(--ease-out)',
            'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150',
          )}
        />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-tarjeta bg-superficie shadow-flotante',
            ancho === 'md' ? 'max-w-md' : 'max-w-2xl',
            'transition-[opacity,scale] duration-200 ease-(--ease-out)',
            'data-starting-style:scale-[0.96] data-starting-style:opacity-0',
            'data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-ending-style:duration-150',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-borde px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-semibold">{titulo}</Dialog.Title>
              {descripcion && (
                <Dialog.Description className="mt-1 text-sm text-tenue">{descripcion}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              render={
                <Button variante="fantasma" tamano="icono" aria-label="Cerrar" className="-mr-2 -mt-1" />
              }
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {pie && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-borde px-5 py-3">{pie}</div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
