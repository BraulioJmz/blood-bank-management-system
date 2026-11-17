import { createContext, use } from 'react';
import type { Usuario } from '../api/tipos';

export interface Sesion {
  usuario: Usuario | null;
  /** true mientras se valida el token guardado contra /auth/yo al recargar. */
  validando: boolean;
  entrar: (username: string, password: string) => Promise<Usuario>;
  salir: () => void;
}

export const Ctx = createContext<Sesion | null>(null);

export function useSesion() {
  const s = use(Ctx);
  if (!s) throw new Error('useSesion fuera de SesionProvider');
  return s;
}
