export type Rol = 'recepcion' | 'laboratorio' | 'inventario' | 'hospital' | 'admin';

export interface Usuario {
  idUsuario: number;
  nombre: string;
  rol: Rol;
  idHospital: number | null;
  username: string;
}

export interface RespuestaLogin {
  token: string;
  usuario: Usuario;
}

export interface FilaDisponibilidad {
  id_tipo_sanguineo: number;
  tipo: string;
  id_componente: number;
  componente: string;
  disponibles: number;
  por_caducar: number;
  proxima_caducidad: string | null;
  dias_alerta_caducidad: number;
}

export interface UnidadPorCaducar {
  id_unidad: number;
  tipo: string;
  componente: string;
  fecha_caducidad: string;
  dias_restantes: number;
  semaforo: 'rojo' | 'amarillo' | 'verde';
  dias_alerta_caducidad: number;
}

export interface SolicitudPendiente {
  id_solicitud: number;
  hospital: string;
  tipo: string;
  componente: string;
  cantidad: number;
  asignadas: number;
  prioridad: 'normal' | 'urgente' | 'emergencia';
  estado: string;
  fecha_solicitud: string;
  horas_espera: number | string;
}

export interface Dashboard {
  refrescado_en: string;
  caducadas_ahora: number;
  por_estado: { id_componente: number; componente: string; estado: string; total: number | string }[];
  disponibilidad: FilaDisponibilidad[];
  alertas: {
    existencias_bajas: FilaDisponibilidad[];
    umbral_bajo: number;
    por_caducar: number;
    /** null si el rol no puede ver unidades (hospital, recepción). */
    proximas_a_caducar: UnidadPorCaducar[] | null;
    solicitudes_urgentes: SolicitudPendiente[];
    solicitudes_abiertas: number;
  };
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

export interface Catalogos {
  tipos: { id_tipo_sanguineo: number; etiqueta: string }[];
  componentes: {
    id_componente: number;
    nombre: string;
    vida_util_dias: number;
    dias_alerta_caducidad: number;
  }[];
  hospitales: { id_hospital: number; nombre: string }[];
  roles: { id_rol: number; nombre: string }[];
}

export type ResultadoPrueba = 'pendiente' | 'no_reactivo' | 'reactivo';
export type EstadoUnidad = 'cuarentena' | 'disponible' | 'asignada' | 'entregada' | 'caducada' | 'descartada';

export interface Donante {
  id_donante: number;
  nombre: string;
  fecha_nacimiento: string;
  sexo: 'M' | 'F';
  id_tipo_sanguineo: number;
  tipo: string;
  edad: number;
  ultima_donacion?: string | null;
}

export interface DonanteDetalle extends Donante {
  donaciones: { id_donacion: number; fecha_donacion: string; tipo_donacion: string; volumen_ml: number }[];
}

export interface Donacion {
  id_donacion: number;
  fecha_donacion: string;
  tipo_donacion: string;
  volumen_ml: number;
  id_donante: number;
  donante: string;
  tipo: string;
  pruebas: Record<string, ResultadoPrueba> | null;
  pendientes: number;
  reactivas: number;
}

export interface DonacionLab {
  id_donacion: number;
  fecha_donacion: string;
  volumen_ml: number;
  tipo: string;
  pruebas: { id_prueba: number; tipo: string; resultado: ResultadoPrueba; fecha: string | null }[];
  pendientes: number;
  reactivas: number;
  unidades: { id_unidad: number; id_componente: number; componente: string; estado: EstadoUnidad }[];
}

export interface UnidadInventario {
  id_unidad: number;
  id_donacion: number;
  estado: EstadoUnidad;
  tipo: string;
  componente: string;
  id_tipo_sanguineo: number;
  id_componente: number;
  fecha_obtencion: string;
  fecha_caducidad: string;
  dias_restantes: number;
  semaforo: 'rojo' | 'amarillo' | 'verde' | null;
}

export interface Movimiento {
  id_movimiento: number;
  tipo_movimiento: 'entrada' | 'salida' | 'baja' | 'cambio_estado';
  fecha_movimiento: string;
  motivo: string | null;
  usuario: string;
}

export type EstadoSolicitud = 'pendiente' | 'parcial' | 'surtida' | 'cancelada';
export type Prioridad = 'normal' | 'urgente' | 'emergencia';

export interface Solicitud {
  id_solicitud: number;
  id_hospital: number;
  hospital: string;
  tipo: string;
  id_tipo_sanguineo: number;
  componente: string;
  id_componente: number;
  cantidad: number;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  fecha_solicitud: string;
  asignadas: number;
}

export interface SolicitudDetalle extends Omit<Solicitud, 'asignadas'> {
  asignaciones: {
    id_asignacion: number;
    fecha_asignacion: string;
    id_unidad: number;
    estado_unidad: EstadoUnidad;
    fecha_caducidad: string;
    autorizo: string;
  }[];
}

export interface UnidadCompatible {
  id_unidad: number;
  tipo: string;
  componente: string;
  fecha_caducidad: string;
  dias_restantes: number;
  semaforo: 'rojo' | 'amarillo' | 'verde';
}

export interface Trazabilidad {
  id_unidad: number;
  estado: EstadoUnidad;
  tipo: string;
  componente: string;
  fecha_obtencion: string;
  fecha_caducidad: string;
  id_donacion: number;
  fecha_donacion: string;
  tipo_donacion: string;
  volumen_ml: number;
  capturo: string;
  id_donante: number;
  donante: string;
  sexo: 'M' | 'F';
  fecha_nacimiento: string;
  pruebas: { tipo: string; resultado: ResultadoPrueba; fecha: string | null }[] | null;
  hermanas: { id_unidad: number; componente: string; estado: EstadoUnidad }[] | null;
  id_asignacion: number | null;
  fecha_asignacion: string | null;
  autorizo: string | null;
  id_solicitud: number | null;
  prioridad: Prioridad | null;
  estado_solicitud: EstadoSolicitud | null;
  id_hospital: number | null;
  hospital: string | null;
  movimientos: Omit<Movimiento, 'id_movimiento'>[];
}

export interface Hospital {
  id_hospital: number;
  nombre: string;
  direccion: string;
  telefono: string;
}

export interface UsuarioAdmin {
  id_usuario: number;
  username: string;
  nombre: string;
  rol: Rol;
  id_hospital: number | null;
  hospital: string | null;
  activo: boolean;
}

export interface RegistroBitacora {
  id_bitacora: number;
  tabla: string;
  operacion: 'INSERT' | 'UPDATE' | 'DELETE';
  id_registro: number | null;
  usuario_bd: string;
  rol_app: string | null;
  usuario_app: string | null;
  nombre_usuario: string | null;
  fecha: string;
  valores_anteriores: Record<string, unknown> | null;
  valores_nuevos: Record<string, unknown> | null;
}
