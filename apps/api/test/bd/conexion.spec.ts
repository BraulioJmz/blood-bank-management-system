import { crearPoolApp, usuariosDemo } from '../helpers/bd';

describe('Infraestructura de pruebas', () => {
  const pool = crearPoolApp(2);
  afterAll(() => pool.end());

  it('se conecta a banco_test como app_login y encuentra los usuarios demo', async () => {
    const u = await usuariosDemo(pool);
    expect(u.inventario.rol).toBe('inventario');
    expect(u.norte.idHospital).not.toBeNull();
  });
});
