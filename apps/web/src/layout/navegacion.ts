import {
  ClipboardList,
  Droplet,
  FlaskConical,
  GitBranch,
  Hospital,
  LayoutDashboard,
  Package,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Rol } from '../api/tipos';

export interface EntradaMenu {
  ruta: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Debe coincidir con los @Roles() de la API (defensa en profundidad; la BD decide al final). */
  roles: Rol[];
}

export const MENU: EntradaMenu[] = [
  {
    ruta: '/',
    etiqueta: 'Panel',
    icono: LayoutDashboard,
    roles: ['recepcion', 'laboratorio', 'inventario', 'hospital', 'admin'],
  },
  {
    ruta: '/donantes',
    etiqueta: 'Donantes y donaciones',
    icono: Droplet,
    roles: ['recepcion', 'laboratorio', 'inventario', 'admin'],
  },
  { ruta: '/laboratorio', etiqueta: 'Laboratorio', icono: FlaskConical, roles: ['laboratorio'] },
  {
    ruta: '/inventario',
    etiqueta: 'Inventario',
    icono: Package,
    roles: ['inventario', 'laboratorio', 'admin'],
  },
  {
    ruta: '/solicitudes',
    etiqueta: 'Solicitudes',
    icono: ClipboardList,
    roles: ['hospital', 'inventario', 'admin'],
  },
  { ruta: '/trazabilidad', etiqueta: 'Trazabilidad', icono: GitBranch, roles: ['inventario', 'admin'] },
  { ruta: '/hospitales', etiqueta: 'Hospitales', icono: Hospital, roles: ['admin'] },
  { ruta: '/usuarios', etiqueta: 'Usuarios', icono: Users, roles: ['admin'] },
  { ruta: '/bitacora', etiqueta: 'Bitácora', icono: ScrollText, roles: ['admin'] },
];

export const menuDe = (rol: Rol) => MENU.filter((e) => e.roles.includes(rol));

export const NOMBRE_ROL: Record<Rol, string> = {
  recepcion: 'Recepción',
  laboratorio: 'Laboratorio',
  inventario: 'Inventario',
  hospital: 'Hospital',
  admin: 'Administración',
};
