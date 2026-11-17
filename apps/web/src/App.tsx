import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './layout/Layout';
import { MENU } from './layout/navegacion';
import { Bitacora } from './pages/Bitacora';
import { Dashboard } from './pages/Dashboard';
import { Donantes } from './pages/Donantes';
import { Hospitales } from './pages/Hospitales';
import { Inventario } from './pages/Inventario';
import { Laboratorio } from './pages/Laboratorio';
import { NoEncontrada } from './pages/NoEncontrada';
import { Login } from './pages/Login';
import { Solicitudes } from './pages/Solicitudes';
import { Trazabilidad } from './pages/Trazabilidad';
import { Usuarios } from './pages/Usuarios';

const PANTALLAS: Record<string, ReactNode> = {
  '/': <Dashboard />,
  '/donantes': <Donantes />,
  '/laboratorio': <Laboratorio />,
  '/inventario': <Inventario />,
  '/solicitudes': <Solicitudes />,
  '/trazabilidad': <Trazabilidad />,
  '/hospitales': <Hospitales />,
  '/usuarios': <Usuarios />,
  '/bitacora': <Bitacora />,
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          {MENU.map((e) => (
            <Route key={e.ruta} element={<RutaProtegida roles={e.roles} />}>
              <Route path={e.ruta} element={PANTALLAS[e.ruta] ?? <NoEncontrada />} />
            </Route>
          ))}
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  );
}
