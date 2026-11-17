import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './layout/Layout';
import { MENU } from './layout/navegacion';
import { Dashboard } from './pages/Dashboard';
import { Donantes } from './pages/Donantes';
import { Inventario } from './pages/Inventario';
import { Laboratorio } from './pages/Laboratorio';
import { Login } from './pages/Login';
import { Pendiente } from './pages/Pendiente';
import { Solicitudes } from './pages/Solicitudes';
import { Trazabilidad } from './pages/Trazabilidad';

const PANTALLAS: Record<string, ReactNode> = {
  '/': <Dashboard />,
  '/donantes': <Donantes />,
  '/laboratorio': <Laboratorio />,
  '/inventario': <Inventario />,
  '/solicitudes': <Solicitudes />,
  '/trazabilidad': <Trazabilidad />,
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          {MENU.map((e) => (
            <Route key={e.ruta} element={<RutaProtegida roles={e.roles} />}>
              <Route path={e.ruta} element={PANTALLAS[e.ruta] ?? <Pendiente titulo={e.etiqueta} />} />
            </Route>
          ))}
          <Route path="*" element={<Pendiente titulo="Página no encontrada" />} />
        </Route>
      </Route>
    </Routes>
  );
}
