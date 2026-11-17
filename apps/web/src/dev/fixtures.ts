/**
 * break-ui: fixtures de peor caso, SOLO en desarrollo (import dinámico desde api/cliente.ts
 * dentro de `if (import.meta.env.DEV)`, así que Vite lo elimina del build de producción).
 *
 * Entran por la misma frontera que los datos reales (la respuesta de la API), no editando
 * componentes. Cada valor es plausible o es el límite real del esquema (001_esquema.sql).
 * Se activan con ?datos=peor | vacio | uno en la URL (interruptor en dev/InterruptorDatos).
 */
import type { Movimiento, Pagina, UnidadInventario } from '../api/tipos';

export type Escenario = 'peor' | 'vacio' | 'uno';

// componente.nombre varchar(60): nombre real largo de un hemocomponente (59 caracteres).
const COMPONENTE_LARGO = 'Concentrado eritrocitario leucorreducido, irradiado y lavado';
// usuario.nombre varchar(150): nombre compuesto con apellido doble y diacríticos.
const NOMBRE_LARGO = 'María de los Ángeles Wiśniewska-Kowalczyk Hernández de la Garza y Montemayor';
// movimiento_inventario.motivo varchar(250): motivo detallado real (≈245 caracteres).
const MOTIVO_LARGO =
  'Bolsa con fuga en la línea de sellado detectada durante la inspección visual previa a la entrega al ' +
  'Hospital Regional de Alta Especialidad Dr. Juan I. Menchaca; se notificó al responsable sanitario y se ' +
  'documentó en el formato FO-BS-017.';

const unidad = (u: Partial<UnidadInventario>): UnidadInventario => ({
  id_unidad: 1,
  id_donacion: 1,
  estado: 'disponible',
  tipo: 'O+',
  componente: 'Concentrado eritrocitario',
  id_tipo_sanguineo: 7,
  id_componente: 1,
  fecha_obtencion: '2026-11-01',
  fecha_caducidad: '2026-12-13',
  dias_restantes: 27,
  semaforo: 'verde',
  ...u,
});

// Cada fila rompe algo distinto (break-ui: repartir las fallas en las primeras filas).
const UNIDADES_PEOR: UnidadInventario[] = [
  unidad({ id_unidad: 2_147_483_647, id_donacion: 2_147_483_600, componente: COMPONENTE_LARGO, tipo: 'AB-' }),
  unidad({ id_unidad: 1_000_001, fecha_caducidad: '2026-11-16', dias_restantes: 0, semaforo: 'rojo' }),
  unidad({
    id_unidad: 1_000_002,
    dias_restantes: 1,
    semaforo: 'rojo',
    componente: 'Concentrado plaquetario',
  }),
  unidad({
    id_unidad: 1_000_003,
    estado: 'cuarentena',
    dias_restantes: 364,
    fecha_caducidad: '2027-11-15',
    componente: 'Plasma fresco congelado',
    semaforo: 'verde',
  }),
  unidad({ id_unidad: 9, estado: 'asignada', semaforo: null, tipo: 'B-' }),
  unidad({
    id_unidad: 1_000_005,
    estado: 'caducada',
    semaforo: null,
    fecha_caducidad: '2025-01-31',
    dias_restantes: -654,
  }),
  unidad({ id_unidad: 1_000_006, estado: 'descartada', semaforo: null, componente: COMPONENTE_LARGO }),
  unidad({ id_unidad: 1_000_007, estado: 'entregada', semaforo: null }),
  ...Array.from({ length: 17 }, (_, i) =>
    unidad({ id_unidad: 1_000_010 + i, semaforo: i % 3 ? 'verde' : 'amarillo' }),
  ),
];

const MOVIMIENTOS_PEOR: Movimiento[] = [
  {
    id_movimiento: 1,
    tipo_movimiento: 'entrada',
    fecha_movimiento: '2026-11-01T14:00:00Z',
    motivo: 'Fraccionamiento',
    usuario: NOMBRE_LARGO,
  },
  {
    id_movimiento: 2,
    tipo_movimiento: 'cambio_estado',
    fecha_movimiento: '2026-11-03T09:30:00Z',
    motivo: null,
    usuario: 'Sistema',
  },
  {
    id_movimiento: 3,
    tipo_movimiento: 'baja',
    fecha_movimiento: '2026-11-16T05:59:00Z',
    motivo: MOTIVO_LARGO,
    usuario: 'Jo',
  },
  ...Array.from({ length: 12 }, (_, i): Movimiento => ({
    id_movimiento: 10 + i,
    tipo_movimiento: 'cambio_estado',
    fecha_movimiento: `2026-11-${String(4 + i).padStart(2, '0')}T12:00:00Z`,
    motivo: 'Reubicada en refrigerador 3',
    usuario: 'Mariana López',
  })),
];

const pagina = <T>(datos: T[], total: number): Pagina<T> => ({ datos, total, pagina: 1, tamano: 25 });

type Generador = (e: Escenario) => unknown;
const RUTAS: [RegExp, Generador][] = [
  [
    /^\/inventario\/unidades\?/,
    (e) =>
      e === 'vacio'
        ? pagina([], 0)
        : e === 'uno'
          ? pagina([UNIDADES_PEOR[1]], 1)
          : pagina(UNIDADES_PEOR, 100_000),
  ],
  [
    /^\/inventario\/unidades\/\d+\/movimientos$/,
    (e) => (e === 'vacio' ? [] : e === 'uno' ? [MOVIMIENTOS_PEOR[0]] : MOVIMIENTOS_PEOR),
  ],
];

export function escenarioActual(): Escenario | null {
  const v = new URLSearchParams(location.search).get('datos');
  return v === 'peor' || v === 'vacio' || v === 'uno' ? v : null;
}

/** Devuelve el fixture si la ruta GET tiene uno y hay escenario activo; si no, undefined. */
export function fixture(ruta: string, metodo = 'GET'): unknown {
  const e = escenarioActual();
  if (!e || metodo !== 'GET') return undefined;
  const r = RUTAS.find(([re]) => re.test(ruta));
  return r ? r[1](e) : undefined;
}

export function registrarRuta(re: RegExp, g: Generador) {
  RUTAS.push([re, g]);
}
