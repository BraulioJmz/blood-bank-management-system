import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onNoAutorizado, token } from '../api/cliente';
import type { RespuestaLogin, Usuario } from '../api/tipos';
import { Ctx, type Sesion } from './contexto';

/**
 * El JWT se guarda en localStorage (simple para el proyecto; en producción real se preferiría
 * cookie httpOnly). El token solo sirve de identidad: los permisos reales los aplica la BD
 * con SET LOCAL ROLE + RLS en cada petición, así que ocultar menús aquí es solo comodidad.
 */
export function SesionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [validando, setValidando] = useState(() => token.leer() !== null);

  const salir = useCallback(() => {
    token.borrar();
    setUsuario(null);
    qc.clear(); // que el siguiente usuario no vea datos en caché del anterior
  }, [qc]);

  useEffect(() => onNoAutorizado(salir), [salir]);

  useEffect(() => {
    if (!token.leer()) return;
    api<Usuario>('/auth/yo')
      .then(setUsuario)
      .catch(() => token.borrar())
      .finally(() => setValidando(false));
  }, []);

  const entrar = useCallback(async (username: string, password: string) => {
    const r = await api<RespuestaLogin>('/auth/login', { method: 'POST', json: { username, password } });
    token.guardar(r.token);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const valor: Sesion = useMemo(
    () => ({ usuario, validando, entrar, salir }),
    [usuario, validando, entrar, salir],
  );
  return <Ctx value={valor}>{children}</Ctx>;
}
