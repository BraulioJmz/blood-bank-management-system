import { Navigate, Outlet, useLocation } from 'react-router';
import type { Rol } from '../api/tipos';
import { Cargando } from '../components/ui/Estado';
import { useSesion } from './sesion';

/** Sin sesión → /login (recordando a dónde iba). Con `roles`, un rol ajeno → panel. */
export function RutaProtegida({ roles }: { roles?: Rol[] }) {
  const { usuario, validando } = useSesion();
  const ubicacion = useLocation();
  if (validando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return <Outlet />;
}
