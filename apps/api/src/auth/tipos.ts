import type { RolApp } from '../db/contexto';

/** Lo que viaja firmado en el JWT. */
export interface PayloadJwt {
  sub: number; // id_usuario
  rol: RolApp;
  id_hospital: number | null;
  nombre: string;
  username: string;
}

/** Usuario autenticado tal como lo ven los controladores y withContext. */
export interface UsuarioActual {
  idUsuario: number;
  rol: RolApp;
  idHospital: number | null;
  nombre: string;
  username: string;
}
