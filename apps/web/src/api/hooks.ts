import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { notificarError, notificarExito } from '../lib/notificar';
import { api } from './cliente';
import type { Catalogos } from './tipos';

/** Catálogos (tipos, componentes, hospitales, roles): casi no cambian, se cachean 10 min. */
export const useCatalogos = () =>
  useQuery({ queryKey: ['catalogos'], queryFn: () => api<Catalogos>('/catalogos'), staleTime: 600_000 });

/**
 * Mutación con notificación: éxito → toast + invalidar las consultas afectadas;
 * error → toast con el mensaje de la BD. Los componentes no repiten ese manejo.
 */
export function useMutacion<V, R = unknown>(opciones: {
  fn: (v: V) => Promise<R>;
  exito?: string | ((r: R, v: V) => string);
  descripcion?: (r: R, v: V) => string | undefined;
  error?: string;
  invalidar?: QueryKey[];
  alTerminar?: (r: R, v: V) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opciones.fn,
    onSuccess: async (r, v) => {
      if (opciones.exito) {
        const t = typeof opciones.exito === 'function' ? opciones.exito(r, v) : opciones.exito;
        notificarExito(t, opciones.descripcion?.(r, v));
      }
      await Promise.all((opciones.invalidar ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      opciones.alTerminar?.(r, v);
    },
    onError: (e) => {
      notificarError(e, opciones.error);
      // Un rechazo de la BD suele significar que la pantalla estaba desactualizada
      // (otra sesión cambió la unidad): se recargan las consultas afectadas.
      (opciones.invalidar ?? []).forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    },
  });
}
