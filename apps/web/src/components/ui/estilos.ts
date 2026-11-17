import { cn } from '../../lib/cn';

/** Clases compartidas por input, select y textarea. */
export const claseControl = cn(
  'w-full rounded-control border border-borde-fuerte bg-superficie px-3 text-sm',
  'transition-[border-color,box-shadow] duration-150 ease-(--ease-out)',
  'placeholder:text-tenue focus:border-info focus:outline-none focus:ring-3 focus:ring-info/15',
  'aria-invalid:border-peligro disabled:opacity-60',
);
