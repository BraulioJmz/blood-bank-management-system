import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** Tabla con scroll horizontal DENTRO de su contenedor (la página nunca se desborda). */
export function Tabla({ children, minimo = '48rem' }: { children: ReactNode; minimo?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: minimo }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  className,
  numerico,
  ...p
}: ThHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <th
      className={cn(
        'px-3 py-2 text-xs font-medium whitespace-nowrap text-tenue first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        numerico ? 'text-right' : 'text-left',
        className,
      )}
      {...p}
    />
  );
}

export function Td({
  className,
  numerico,
  ...p
}: TdHTMLAttributes<HTMLTableCellElement> & { numerico?: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        numerico && 'cifras text-right',
        className,
      )}
      {...p}
    />
  );
}

export function Fila({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t border-borde', className)} {...p} />;
}
