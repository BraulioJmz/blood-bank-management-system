import { clsx, type ClassValue } from 'clsx';

/** Une clases condicionales (clsx). Sin tailwind-merge: los componentes no se pisan clases. */
export const cn = (...v: ClassValue[]) => clsx(v);
