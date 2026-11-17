import { Route, Routes } from 'react-router';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './layout/Layout';
import { MENU } from './layout/navegacion';
import { Login } from './pages/Login';
import { Pendiente } from './pages/Pendiente';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida />}>
        <Route element={<Layout />}>
          {MENU.map((e) => (
            <Route key={e.ruta} element={<RutaProtegida roles={e.roles} />}>
              <Route path={e.ruta} element={<Pendiente titulo={e.etiqueta} />} />
            </Route>
          ))}
          <Route path="*" element={<Pendiente titulo="Página no encontrada" />} />
        </Route>
      </Route>
    </Routes>
  );
}
