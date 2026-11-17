import { Dialog } from '@base-ui/react/dialog';
import { Droplet, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useSesion } from '../auth/contexto';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';
import { NOMBRE_ROL, menuDe } from './navegacion';

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <span className="grid size-8 place-items-center rounded-control bg-acento-suave text-acento">
        <Droplet className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-semibold">Banco de Sangre</span>
    </div>
  );
}

/** Menú filtrado por rol. Sin animación al navegar: se usa decenas de veces al día. */
function Menu_({ alNavegar }: { alNavegar?: () => void }) {
  const { usuario } = useSesion();
  if (!usuario) return null;
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {menuDe(usuario.rol).map(({ ruta, etiqueta, icono: Icono }) => (
        <NavLink
          key={ruta}
          to={ruta}
          end={ruta === '/'}
          onClick={alNavegar}
          className={({ isActive }) =>
            cn(
              'flex h-9 items-center gap-2.5 rounded-control px-3 text-sm',
              isActive
                ? 'bg-hundido font-medium text-texto'
                : 'text-tenue [@media(hover:hover)]:hover:bg-hundido [@media(hover:hover)]:hover:text-texto',
            )
          }
        >
          <Icono className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{etiqueta}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Perfil() {
  const { usuario, salir } = useSesion();
  if (!usuario) return null;
  return (
    <div className="flex items-center gap-2 border-t border-borde px-3 pt-3">
      <p
        className="min-w-0 flex-1 truncate text-sm font-medium"
        title={`${usuario.nombre} · ${NOMBRE_ROL[usuario.rol]} · ${usuario.username}`}
      >
        {usuario.nombre}
      </p>
      <Button
        variante="fantasma"
        tamano="icono"
        onClick={salir}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function Layout() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Escritorio: barra lateral fija */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-borde bg-superficie py-4 lg:flex">
        <Marca />
        <div className="flex-1 overflow-y-auto px-2">
          <Menu_ />
        </div>
        <Perfil />
      </aside>

      {/* Móvil: barra superior + drawer (Base UI Dialog: foco atrapado, Esc y clic fuera cierran) */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-borde bg-superficie/90 px-2 backdrop-blur lg:hidden">
        <Dialog.Root open={abierto} onOpenChange={setAbierto}>
          <Dialog.Trigger render={<Button variante="fantasma" tamano="icono" aria-label="Abrir menú" />}>
            <Menu className="size-5" aria-hidden />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop
              className={cn(
                'fixed inset-0 z-40 bg-texto/30 transition-opacity duration-300 ease-(--ease-out)',
                'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-200',
              )}
            />
            <Dialog.Popup
              className={cn(
                'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 bg-superficie py-4 shadow-flotante',
                // Entra con la curva de drawer; sale más rápido que entra.
                'transition-transform duration-300 ease-(--ease-drawer)',
                'data-starting-style:-translate-x-full data-ending-style:-translate-x-full data-ending-style:duration-200',
              )}
            >
              <div className="flex items-center justify-between pr-2">
                <Dialog.Title render={<div />}>
                  <Marca />
                </Dialog.Title>
                <Dialog.Close render={<Button variante="fantasma" tamano="icono" aria-label="Cerrar menú" />}>
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              <div className="flex-1 overflow-y-auto px-2">
                <Menu_ alNavegar={() => setAbierto(false)} />
              </div>
              <Perfil />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
        <Marca />
      </header>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[100rem]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
