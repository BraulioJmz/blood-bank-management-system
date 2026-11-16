import type { Pool, PoolClient } from 'pg';

/** Roles de la aplicación (los que viajan en el JWT). */
export const ROLES_APP = [
  'recepcion',
  'laboratorio',
  'inventario',
  'hospital',
  'admin',
] as const;
export type RolApp = (typeof ROLES_APP)[number];

/**
 * Lista blanca rol de app → rol de BD. `SET ROLE` no admite parámetros ($1):
 * el nombre se interpola en el SQL, así que SOLO se aceptan estos valores exactos.
 */
const ROL_BD: Record<RolApp, string> = {
  recepcion: 'rol_recepcion',
  laboratorio: 'rol_laboratorio',
  inventario: 'rol_inventario',
  hospital: 'rol_hospital',
  admin: 'rol_admin',
};

export interface ContextoUsuario {
  idUsuario: number;
  rol: RolApp;
  idHospital?: number | null;
}

export class ContextoInvalidoError extends Error {}

export function rolBd(rol: string): string {
  if (!Object.prototype.hasOwnProperty.call(ROL_BD, rol)) {
    throw new ContextoInvalidoError(`Rol de aplicación no permitido: ${rol}`);
  }
  return ROL_BD[rol as RolApp];
}

/**
 * Ejecuta `fn` en UNA transacción con la identidad del usuario:
 *   BEGIN → SET LOCAL ROLE → set_config(app.*, …, true) → fn → COMMIT | ROLLBACK → release
 *
 * `SET LOCAL` y `set_config(…, true)` duran solo hasta el fin de la transacción: al
 * devolver la conexión al pool no queda ni el rol ni la identidad "pegados" para la
 * siguiente petición que la reutilice.
 */
export async function ejecutarConContexto<T>(
  pool: Pool,
  ctx: ContextoUsuario,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const rol = rolBd(ctx.rol); // valida ANTES de pedir conexión
  if (!Number.isInteger(ctx.idUsuario) || ctx.idUsuario <= 0) {
    throw new ContextoInvalidoError('id de usuario inválido');
  }
  const client = await pool.connect();
  let conexionRota = false;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${rol}`);
    await client.query(
      "SELECT set_config('app.id_usuario', $1, true), set_config('app.id_hospital', $2, true), set_config('app.rol', $3, true)",
      [
        String(ctx.idUsuario),
        ctx.idHospital != null ? String(ctx.idHospital) : '',
        rol,
      ],
    );
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    // Si ni el ROLLBACK funciona, la conexión está rota: release(true) la destruye
    // en vez de devolverla al pool con una transacción a medias.
    await client.query('ROLLBACK').catch(() => {
      conexionRota = true;
    });
    throw e;
  } finally {
    client.release(conexionRota);
  }
}
