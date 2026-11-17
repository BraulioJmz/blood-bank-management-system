/** Formatos de fecha, hora y número en es-MX, zona America/Mexico_City (la de la BD). */
const ZONA = 'America/Mexico_City';

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

/**
 * `date` de PostgreSQL ('2026-11-20'): se fija a mediodía local para que la zona no la mueva
 * de día. `timestamptz` (ISO con hora, en UTC): se convierte a la zona de México; truncarlo
 * a los 10 primeros caracteres daría el día UTC (un día adelantado por la noche).
 */
const formatearDia = (d: string, op: Intl.DateTimeFormatOptions) =>
  d.length === 10
    ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', op)
    : new Date(d).toLocaleDateString('es-MX', { ...op, timeZone: ZONA });

export const fechaCorta = (d: string) => formatearDia(d, { day: 'numeric', month: 'short' });

export const fecha = (d: string) => formatearDia(d, { day: 'numeric', month: 'short', year: 'numeric' });

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });

/** '16 nov, 08:43 p.m.' para columnas angostas; agrega el año solo si no es el actual. */
export const fechaCortaHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });
};

export const numero = (n: number | string) => Number(n).toLocaleString('es-MX');

export const dias = (n: number) => (n <= 0 ? 'Hoy' : n === 1 ? '1 día' : `${n} días`);
