import { toast } from 'sonner';
import { ErrorApi } from '../api/cliente';

/**
 * Notificaciones (ask-sonner): un solo <Toaster richColors> en la raíz, toast() desde
 * los manejadores de eventos (nunca desde efectos: en StrictMode se duplicarían).
 *
 * Los errores de negocio vienen de PostgreSQL: el RAISE EXCEPTION trae el mensaje en
 * español y un SQLSTATE propio (BS001…), que PgErrorFilter pasa como `codigo`. Se muestra
 * el mensaje tal cual y el código como descripción, para poder rastrearlo en el reporte.
 */
const TITULO_POR_STATUS: Record<number, string> = {
  400: 'Datos inválidos',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Operación rechazada',
  422: 'Regla de negocio',
};

export function notificarError(e: unknown, contexto?: string) {
  if (e instanceof ErrorApi) {
    const titulo = TITULO_POR_STATUS[e.status] ?? 'Error del servidor';
    toast.error(contexto ? `${contexto}: ${titulo.toLowerCase()}` : titulo, {
      description: e.codigo ? `${e.message} (${e.codigo})` : e.message,
      // Los rechazos de la BD se leen con calma: duran más que un éxito.
      duration: 8000,
    });
    return;
  }
  toast.error(contexto ?? 'Algo salió mal', {
    description: e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo.',
  });
}

export const notificarExito = (titulo: string, descripcion?: string) =>
  toast.success(titulo, { description: descripcion });
