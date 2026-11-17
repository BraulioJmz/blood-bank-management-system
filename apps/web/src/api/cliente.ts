/**
 * Cliente HTTP mínimo sobre fetch. La API vive en /api (proxy de Vite en dev, nginx en prod).
 * Traduce las respuestas de error de Nest/PgErrorFilter a ErrorApi con el mensaje en español
 * que ya viene del RAISE EXCEPTION de PostgreSQL.
 */
const CLAVE_TOKEN = 'banco.token';

export const token = {
  leer: () => {
    try {
      return localStorage.getItem(CLAVE_TOKEN);
    } catch {
      return null;
    }
  },
  guardar: (t: string) => localStorage.setItem(CLAVE_TOKEN, t),
  borrar: () => localStorage.removeItem(CLAVE_TOKEN),
};

export class ErrorApi extends Error {
  readonly status: number;
  /** SQLSTATE (p. ej. BS001) cuando el error viene de PostgreSQL. */
  readonly codigo?: string;
  constructor(status: number, message: string, codigo?: string) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

/** Se llama ante un 401 (token vencido o inválido); lo registra AuthProvider. */
let alNoAutorizado: () => void = () => {};
export const onNoAutorizado = (fn: () => void) => {
  alNoAutorizado = fn;
};

export async function api<T>(ruta: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...resto } = init;
  if (import.meta.env.DEV) {
    // break-ui: fixtures de peor caso (?datos=peor|vacio|uno). Vite elimina este bloque en producción.
    const [{ fixture }] = await Promise.all([
      import('../dev/fixtures'),
      import('../dev/fixturesSolicitudes'),
    ]);
    const f = fixture(ruta, resto.method);
    if (f !== undefined) return f as T;
  }
  const t = token.leer();
  const res = await fetch(`/api${ruta}`, {
    ...resto,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined && { 'Content-Type': 'application/json' }),
      ...(t && { Authorization: `Bearer ${t}` }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : resto.body,
  });

  if (res.status === 204) return undefined as T;
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && t) alNoAutorizado();
    const msg = Array.isArray(cuerpo?.message) ? cuerpo.message.join('. ') : cuerpo?.message;
    throw new ErrorApi(res.status, msg ?? `Error ${res.status}`, cuerpo?.codigo);
  }
  return cuerpo as T;
}
