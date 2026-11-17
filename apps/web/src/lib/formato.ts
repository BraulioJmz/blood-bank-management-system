/** Formatos de fecha, hora y número en es-MX, zona America/Mexico_City (la de la BD). */
const ZONA = 'America/Mexico_City';

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

/** Fecha sin hora ('2026-11-20'): se fija a mediodía para que la zona no la mueva de día. */
const soloFecha = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`);

export const fechaCorta = (d: string) =>
  soloFecha(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

export const fecha = (d: string) =>
  soloFecha(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA,
  });

export const numero = (n: number | string) => Number(n).toLocaleString('es-MX');

export const dias = (n: number) => (n <= 0 ? 'Hoy' : n === 1 ? '1 día' : `${n} días`);
