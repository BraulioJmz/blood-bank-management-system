/**
 * Pruebas e2e: HTTP real (supertest) → Nest (guards, DTOs, PgErrorFilter) → PostgreSQL
 * (`banco_test`, sin mocks). Cada flujo usa el JWT del usuario demo de su rol, así que
 * se ejercitan juntos @Roles(), withContext (SET LOCAL ROLE + app.*), GRANT, RLS y triggers.
 */
import './entorno-test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/main';
import { DB_TEST, guardarEvidencia } from '../helpers/bd';

/** El body de supertest es `any`: se declara la forma esperada en cada uso. */
const cuerpo = <T>(r: { body: unknown }) => r.body as T;
type Lista<T> = { datos: T[] };

const CLAVE = 'Demo2026!'; // contraseña de los usuarios demo (db/seeds/002_usuarios_demo.sql)

type Rol =
  | 'recepcion'
  | 'laboratorio'
  | 'inventario'
  | 'hospital.norte'
  | 'hospital.sur'
  | 'admin';

describe('e2e: flujos principales por rol', () => {
  let app: INestApplication;
  const tokens = {} as Record<Rol, string>;
  const filas: string[] = [];
  const anotar = (
    flujo: string,
    paso: string,
    esperado: string,
    obtenido: string,
  ) => filas.push(`| ${flujo} | ${paso} | ${esperado} | ${obtenido} |`);

  const http = () => request(app.getHttpServer());
  const como = (rol: Rol) => ({
    get: (url: string) =>
      http().get(`/api${url}`).set('Authorization', `Bearer ${tokens[rol]}`),
    post: (url: string, body?: object) =>
      http()
        .post(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[rol]}`)
        .send(body ?? {}),
    patch: (url: string, body: object) =>
      http()
        .patch(`/api${url}`)
        .set('Authorization', `Bearer ${tokens[rol]}`)
        .send(body),
  });

  // Estado compartido entre pasos del flujo (los `it` corren en orden con --runInBand).
  let idTipo: number;
  let idEritro: number;
  const unidades: number[] = [];
  let idSolicitud: number;
  let idAsignacion: number;

  beforeAll(async () => {
    expect(process.env.DB_NAME).toBe(DB_TEST); // nunca contra la BD de desarrollo
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configurarApp(modulo.createNestApplication({ logger: false }));
    await app.init();

    for (const rol of Object.keys({
      recepcion: 1,
      laboratorio: 1,
      inventario: 1,
      'hospital.norte': 1,
      'hospital.sur': 1,
      admin: 1,
    }) as Rol[]) {
      const r = await http()
        .post('/api/auth/login')
        .send({ username: rol, password: CLAVE })
        .expect(200);
      tokens[rol] = r.body.token;
    }
    const cat = await como('admin').get('/catalogos').expect(200);
    idTipo = cuerpo<{
      tipos: { etiqueta: string; id_tipo_sanguineo: number }[];
    }>(cat).tipos.find(
      (t: { etiqueta: string }) => t.etiqueta === 'AB-',
    )!.id_tipo_sanguineo;
    idEritro = cuerpo<{
      componentes: { nombre: string; id_componente: number }[];
    }>(cat).componentes.find(
      (c: { nombre: string }) => c.nombre === 'Concentrado eritrocitario',
    )!.id_componente;
  });

  afterAll(async () => {
    guardarEvidencia(
      'resultados-e2e.md',
      [
        '# Pruebas e2e (supertest → Nest → PostgreSQL)',
        '',
        'Cada paso usa el JWT del usuario demo de su rol contra la BD real `banco_test`.',
        '',
        '| Flujo | Paso | Esperado | Obtenido |',
        '|---|---|---|---|',
        ...filas,
        '',
      ].join('\n'),
    );
    await app?.close();
  });

  describe('autenticación', () => {
    it('rechaza credenciales inválidas y peticiones sin token', async () => {
      const mal = await http()
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'incorrecta1' });
      expect(mal.status).toBe(401);
      const sin = await http().get('/api/auth/yo');
      expect(sin.status).toBe(401);
      const yo = await como('hospital.norte').get('/auth/yo').expect(200);
      expect(yo.body).toMatchObject({
        rol: 'hospital',
        username: 'hospital.norte',
      });
      expect(yo.body.idHospital).toEqual(expect.any(Number));
      anotar(
        'Auth',
        'login con contraseña incorrecta / sin token',
        '401 / 401',
        `${mal.status} / ${sin.status}`,
      );
    });
  });

  describe('recepción → laboratorio: falla segura', () => {
    it('recepción registra donante y dos donaciones; la BD crea 5 pruebas pendientes por donación', async () => {
      for (let i = 0; i < 2; i++) {
        const d = await como('recepcion')
          .post('/donantes', {
            nombre: `Donante e2e ${i}`,
            fecha_nacimiento: '1991-03-15',
            sexo: 'F',
            id_tipo_sanguineo: idTipo,
          })
          .expect(201);
        const don = await como('recepcion')
          .post('/donaciones', {
            id_donante: d.body.id_donante,
            tipo_donacion: 'altruista',
            volumen_ml: 450,
          })
          .expect(201);
        expect(don.body.pruebas).toHaveLength(5);
        expect(
          cuerpo<{ pruebas: { resultado: string }[] }>(don).pruebas.every(
            (p: { resultado: string }) => p.resultado === 'pendiente',
          ),
        ).toBe(true);

        const fr = await como('laboratorio')
          .post(`/laboratorio/donaciones/${don.body.id_donacion}/fraccionar`, {
            componentes: [idEritro],
          })
          .expect(201);
        expect(fr.body[0].estado).toBe('cuarentena');
        unidades.push(fr.body[0].id_unidad);

        for (const p of don.body.pruebas) {
          await como('laboratorio')
            .patch(`/laboratorio/pruebas/${p.id_prueba}`, {
              resultado: 'no_reactivo',
            })
            .expect(200);
        }
      }
      const u = await como('inventario')
        .get(`/inventario/unidades?id_unidad=${unidades[0]}`)
        .expect(200);
      expect(u.body.datos[0].estado).toBe('disponible');
      anotar(
        'Recepción → Laboratorio',
        'unidad tras 5 pruebas no reactivas',
        'disponible',
        u.body.datos[0].estado,
      );
    });

    it('un resultado ya capturado no se puede cambiar (BS014)', async () => {
      const lab = await como('laboratorio')
        .get('/laboratorio/donaciones?filtro=todas&tamano=200')
        .expect(200);
      const prueba = cuerpo<
        Lista<{ pruebas: { id_prueba: number; resultado: string }[] }>
      >(lab)
        .datos.flatMap(
          (d: { pruebas: { id_prueba: number; resultado: string }[] }) =>
            d.pruebas,
        )
        .find((p: { resultado: string }) => p.resultado === 'no_reactivo')!;
      const r = await como('laboratorio').patch(
        `/laboratorio/pruebas/${prueba.id_prueba}`,
        { resultado: 'reactivo' },
      );
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe('BS014');
      anotar(
        'Laboratorio',
        'cambiar un resultado definitivo',
        '409 BS014',
        `${r.status} ${r.body.codigo}`,
      );
    });

    it('recepción no puede ver el inventario (@Roles)', async () => {
      const r = await como('recepcion').get('/inventario/unidades');
      expect(r.status).toBe(403);
      anotar('Recepción', 'GET /inventario/unidades', '403', String(r.status));
    });
  });

  describe('hospital: solicitudes con RLS', () => {
    it('hospital norte crea una solicitud; el sur no la ve (RLS → 404) y no aparece en su lista', async () => {
      const s = await como('hospital.norte')
        .post('/solicitudes', {
          id_tipo_sanguineo: idTipo,
          id_componente: idEritro,
          cantidad: 2,
          prioridad: 'urgente',
        })
        .expect(201);
      idSolicitud = s.body.id_solicitud;
      expect(s.body.estado).toBe('pendiente');

      const ajena = await como('hospital.sur').get(
        `/solicitudes/${idSolicitud}`,
      );
      expect(ajena.status).toBe(404);
      const listaSur = await como('hospital.sur')
        .get('/solicitudes?tamano=200')
        .expect(200);
      expect(
        cuerpo<Lista<{ id_solicitud: number }>>(listaSur).datos.some(
          (x: { id_solicitud: number }) => x.id_solicitud === idSolicitud,
        ),
      ).toBe(false);
      const listaNorte = await como('hospital.norte')
        .get('/solicitudes?tamano=200')
        .expect(200);
      expect(
        cuerpo<Lista<{ id_solicitud: number }>>(listaNorte).datos.some(
          (x: { id_solicitud: number }) => x.id_solicitud === idSolicitud,
        ),
      ).toBe(true);
      anotar(
        'Hospital',
        'el sur consulta la solicitud del norte',
        '404 (RLS)',
        String(ajena.status),
      );
    });

    it('un hospital no puede asignar unidades (@Roles)', async () => {
      const r = await como('hospital.norte').post(
        `/solicitudes/${idSolicitud}/asignar`,
        { id_unidad: unidades[0] },
      );
      expect(r.status).toBe(403);
    });
  });

  describe('inventario: asignación, concurrencia y entrega', () => {
    it('asigna manualmente una unidad compatible; la solicitud queda parcial', async () => {
      const comp = await como('inventario')
        .get(`/inventario/compatibles/${idSolicitud}`)
        .expect(200);
      expect(
        cuerpo<{ id_unidad: number }[]>(comp).map((u) => u.id_unidad),
      ).toEqual(expect.arrayContaining(unidades));
      const r = await como('inventario')
        .post(`/solicitudes/${idSolicitud}/asignar`, { id_unidad: unidades[0] })
        .expect(200);
      idAsignacion = r.body.id_asignacion;
      expect(r.body.estado_solicitud).toBe('parcial');
      anotar(
        'Inventario',
        'asignación manual 1 de 2',
        'parcial',
        r.body.estado_solicitud,
      );
    });

    it('asignar otra vez la misma unidad se rechaza (BS001)', async () => {
      const r = await como('inventario').post(
        `/solicitudes/${idSolicitud}/asignar`,
        { id_unidad: unidades[0] },
      );
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe('BS001');
      anotar(
        'Inventario',
        'reasignar una unidad ya asignada',
        '409 BS001',
        `${r.status} ${r.body.codigo}`,
      );
    });

    it('la asignación automática FEFO completa la solicitud', async () => {
      const r = await como('inventario')
        .post(`/solicitudes/${idSolicitud}/asignar-automatica`)
        .expect(200);
      expect(r.body.asignadas).toBe(1);
      expect(r.body.estado_solicitud).toBe('surtida');
      anotar(
        'Inventario',
        'FEFO para la unidad faltante',
        '1 asignada, surtida',
        `${r.body.asignadas}, ${r.body.estado_solicitud}`,
      );
    });

    it('entrega la unidad y ya no se puede dar de baja', async () => {
      await como('inventario')
        .post(`/inventario/unidades/${unidades[0]}/entregar`)
        .expect(200);
      const baja = await como('inventario').post(
        `/inventario/unidades/${unidades[0]}/baja`,
        { motivo: 'Intento tras entrega' },
      );
      expect(baja.status).toBe(409);
      expect(baja.body.codigo).toBe('BS010');
      anotar(
        'Inventario',
        'baja de una unidad entregada',
        '409 BS010',
        `${baja.status} ${baja.body.codigo}`,
      );
    });

    it('la trazabilidad muestra donación, pruebas y hospital destino', async () => {
      const t = await como('inventario')
        .get(`/trazabilidad/unidades/${unidades[0]}`)
        .expect(200);
      expect(t.body).toMatchObject({
        estado: 'entregada',
        id_solicitud: idSolicitud,
        hospital: 'Hospital General Norte',
      });
      expect(t.body.pruebas).toHaveLength(5);
      expect(
        cuerpo<{ movimientos: { tipo_movimiento: string }[] }>(
          t,
        ).movimientos.map(
          (m: { tipo_movimiento: string }) => m.tipo_movimiento,
        ),
      ).toEqual(expect.arrayContaining(['entrada', 'salida']));
    });
  });

  describe('admin: bitácora y usuarios', () => {
    it('la asignación quedó en la bitácora con el rol y el usuario de inventario (usuario_bd = rol_app)', async () => {
      const yo = await como('inventario').get('/auth/yo').expect(200);
      const b = await como('admin')
        .get(`/admin/bitacora?tabla=asignacion&id_registro=${idAsignacion}`)
        .expect(200);
      expect(b.body.datos[0]).toMatchObject({
        operacion: 'INSERT',
        rol_app: 'rol_inventario',
        usuario_bd: 'rol_inventario',
        usuario_app: String(yo.body.idUsuario),
      });
      anotar(
        'Admin',
        'bitácora de la asignación: rol_app / usuario_bd',
        'rol_inventario / rol_inventario',
        `${b.body.datos[0].rol_app} / ${b.body.datos[0].usuario_bd}`,
      );
    });

    it('un usuario de rol hospital sin hospital se rechaza en la BD (BS016)', async () => {
      const r = await como('admin').post('/admin/usuarios', {
        username: 'hospital.sin.asignar',
        nombre: 'Usuario e2e',
        password: 'Prueba2026x',
        rol: 'hospital',
      });
      expect(r.status).toBe(422);
      expect(r.body.codigo).toBe('BS016');
      anotar(
        'Admin',
        'crear usuario hospital sin hospital',
        '422 BS016',
        `${r.status} ${r.body.codigo}`,
      );
    });

    it('solo admin consulta la bitácora (@Roles)', async () => {
      const r = await como('inventario').get('/admin/bitacora');
      expect(r.status).toBe(403);
    });
  });

  describe('dashboard', () => {
    it.each<[Rol, boolean]>([
      ['recepcion', false],
      ['laboratorio', true],
      ['inventario', true],
      ['hospital.norte', false],
      ['admin', true],
    ])('%s ve el panel (próximas a caducar: %s)', async (rol, veProximas) => {
      const r = await como(rol).get('/dashboard').expect(200);
      expect(r.body.disponibilidad).toHaveLength(32); // 8 tipos × 4 componentes (CROSS JOIN)
      expect(r.body.alertas.proximas_a_caducar !== null).toBe(veProximas);
    });
  });
});
