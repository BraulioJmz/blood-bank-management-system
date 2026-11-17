/**
 * break-ui (solo desarrollo): peor caso de solicitudes. Límites de 001_esquema.sql y del DTO:
 * hospital.nombre varchar(150), cantidad 1..50 (CrearSolicitudDto), usuario.nombre varchar(150).
 */
import type { Pagina, Solicitud, SolicitudDetalle, UnidadCompatible } from '../api/tipos';
import { registrarRuta } from './fixtures';

// Nombre real de un hospital mexicano (≈118 caracteres), dentro de los 150 permitidos.
const HOSPITAL_LARGO =
  'Hospital Regional de Alta Especialidad del Bajío "Dr. Ignacio Morones Prieto" — Unidad de Medicina Transfusional';
const COMPONENTE_LARGO = 'Concentrado eritrocitario leucorreducido, irradiado y lavado';
const AUTORIZO_LARGO = 'María de los Ángeles Wiśniewska-Kowalczyk Hernández de la Garza y Montemayor';

const s = (x: Partial<Solicitud>): Solicitud => ({
  id_solicitud: 1,
  id_hospital: 1,
  hospital: 'Hospital General Norte',
  tipo: 'O+',
  id_tipo_sanguineo: 7,
  componente: 'Concentrado eritrocitario',
  id_componente: 1,
  cantidad: 2,
  prioridad: 'normal',
  estado: 'pendiente',
  fecha_solicitud: '2026-11-16T15:00:00Z',
  asignadas: 0,
  ...x,
});

const SOLICITUDES_PEOR: Solicitud[] = [
  s({
    id_solicitud: 2_147_483_647,
    hospital: HOSPITAL_LARGO,
    componente: COMPONENTE_LARGO,
    cantidad: 50,
    asignadas: 49,
    prioridad: 'emergencia',
    estado: 'parcial',
  }),
  s({ id_solicitud: 1_000_001, hospital: 'IMSS', cantidad: 1, asignadas: 0, prioridad: 'emergencia' }),
  s({ id_solicitud: 1_000_002, cantidad: 50, asignadas: 50, estado: 'surtida', prioridad: 'urgente' }),
  s({
    id_solicitud: 1_000_003,
    estado: 'cancelada',
    cantidad: 3,
    asignadas: 0,
    fecha_solicitud: '2024-02-29T23:59:00Z',
  }),
  s({
    id_solicitud: 1_000_004,
    tipo: 'AB-',
    hospital: 'Clínica Ñuñoa · Unidad Pediátrica',
    asignadas: 1,
    estado: 'parcial',
  }),
  ...Array.from({ length: 20 }, (_, i) => s({ id_solicitud: 1_000_010 + i, cantidad: 1 + (i % 4) })),
];

// `asignadas` sobra en el detalle; TypeScript lo permite al venir de un spread.
const DETALLE_PEOR: SolicitudDetalle = {
  ...SOLICITUDES_PEOR[0],
  asignaciones: Array.from({ length: 49 }, (_, i) => ({
    id_asignacion: 5_000_000 + i,
    fecha_asignacion: '2026-11-16T16:00:00Z',
    id_unidad: 1_000_000 + i,
    estado_unidad: i % 7 === 0 ? 'entregada' : 'asignada',
    fecha_caducidad: '2026-12-20',
    autorizo: i === 0 ? AUTORIZO_LARGO : 'Mariana López',
  })),
};

const COMPATIBLES_PEOR: UnidadCompatible[] = Array.from({ length: 50 }, (_, i) => ({
  id_unidad: 2_000_000_000 + i,
  tipo: 'O+',
  componente: COMPONENTE_LARGO,
  fecha_caducidad: '2026-11-16',
  dias_restantes: i < 3 ? 0 : i,
  semaforo: i < 3 ? 'rojo' : i < 8 ? 'amarillo' : 'verde',
}));

const pagina = <T>(datos: T[], total: number): Pagina<T> => ({ datos, total, pagina: 1, tamano: 25 });

registrarRuta(/^\/solicitudes\?/, (e) =>
  e === 'vacio'
    ? pagina([], 0)
    : e === 'uno'
      ? pagina([SOLICITUDES_PEOR[1]], 1)
      : pagina(SOLICITUDES_PEOR, 12_345),
);
registrarRuta(/^\/solicitudes\/\d+$/, (e) =>
  e === 'vacio'
    ? { ...DETALLE_PEOR, asignaciones: [] }
    : e === 'uno'
      ? { ...DETALLE_PEOR, asignaciones: DETALLE_PEOR.asignaciones.slice(0, 1) }
      : DETALLE_PEOR,
);
registrarRuta(/^\/inventario\/compatibles\/\d+$/, (e) =>
  e === 'vacio' ? [] : e === 'uno' ? COMPATIBLES_PEOR.slice(0, 1) : COMPATIBLES_PEOR,
);
