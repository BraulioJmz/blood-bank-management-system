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
  por_caducar_7d: number;
  proxima_caducidad: string | null;
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
    por_caducar_7d: number;
    solicitudes_urgentes: SolicitudPendiente[];
    solicitudes_abiertas: number;
  };
}
