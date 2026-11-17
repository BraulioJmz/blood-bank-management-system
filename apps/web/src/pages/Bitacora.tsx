import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { api } from '../api/cliente';
import type { Pagina, RegistroBitacora } from '../api/tipos';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Campo';
import { Card } from '../components/ui/Card';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { claseControl } from '../components/ui/estilos';
import { Paginacion } from '../components/ui/Paginacion';
import { Segmentos } from '../components/ui/Segmentos';
import { Fila, Tabla, Td, Th } from '../components/ui/Tabla';
import { cn } from '../lib/cn';
import { fechaHora, numero } from '../lib/formato';

const TAMANO = 50;
// Tablas con trigger de bitácora (004_seguridad.sql).
const TABLAS = [
  'hospital',
  'usuario',
  'donante',
  'donacion',
  'prueba_tamizaje',
  'unidad_sangre',
  'movimiento_inventario',
  'solicitud',
  'asignacion',
];
const ROLES = ['rol_recepcion', 'rol_laboratorio', 'rol_inventario', 'rol_hospital', 'rol_admin'];
const TONO_OP = { INSERT: 'ok', UPDATE: 'info', DELETE: 'peligro' } as const;

const texto = (v: unknown) =>
  v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** Campos de la fila: antes → después, resaltando lo que cambió. */
function Diferencias({ r }: { r: RegistroBitacora }) {
  const antes = r.valores_anteriores ?? {};
  const despues = r.valores_nuevos ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr className="text-left text-tenue">
            <th className="py-1 pr-8 font-medium">Campo</th>
            {r.valores_anteriores && <th className="py-1 pr-4 font-medium">Antes</th>}
            {r.valores_nuevos && <th className="py-1 font-medium">Después</th>}
          </tr>
        </thead>
        <tbody className="font-mono">
          {campos.map((c) => {
            const cambio = r.operacion === 'UPDATE' && texto(antes[c]) !== texto(despues[c]);
            return (
              <tr key={c} className={cn(cambio && 'bg-aviso-suave')}>
                <td className="py-0.5 pr-8 align-top text-tenue">{c}</td>
                {r.valores_anteriores && (
                  <td className="max-w-80 py-0.5 pr-4 align-top break-all">{texto(antes[c])}</td>
                )}
                {r.valores_nuevos && (
                  <td className={cn('max-w-80 py-0.5 align-top break-all', cambio && 'font-semibold')}>
                    {texto(despues[c])}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Bitacora() {
  const [tabla, setTabla] = useState('');
  const [operacion, setOperacion] = useState<'todas' | 'INSERT' | 'UPDATE' | 'DELETE'>('todas');
  const [rol, setRol] = useState('');
  const [registro, setRegistro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<number | null>(null);

  const params = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO) });
  if (tabla) params.set('tabla', tabla);
  if (operacion !== 'todas') params.set('operacion', operacion);
  if (rol) params.set('rol_app', rol);
  if (/^\d+$/.test(registro)) params.set('id_registro', registro);

  const consulta = useQuery({
    queryKey: ['bitacora', params.toString()],
    queryFn: () => api<Pagina<RegistroBitacora>>(`/admin/bitacora?${params}`),
    placeholderData: (prev) => prev,
  });
  const filtrar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
      setAbierto(null);
    };

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Bitácora de auditoría"
        descripcion="Escrita solo por triggers de PostgreSQL. Ningún rol de la aplicación puede modificarla ni borrarla."
      />
      <Card>
        <div className="grid grid-cols-2 gap-3 border-b border-borde p-3 sm:px-5 lg:grid-cols-[minmax(0,13rem)_minmax(0,13rem)_minmax(0,8rem)_1fr]">
          <Select etiqueta="Tabla" value={tabla} onChange={(e) => filtrar(setTabla)(e.target.value)}>
            <option value="">Todas</option>
            {TABLAS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Select etiqueta="Rol de la app" value={rol} onChange={(e) => filtrar(setRol)(e.target.value)}>
            <option value="">Todos</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="id-registro" className="text-sm font-medium">
              Registro #
            </label>
            <input
              id="id-registro"
              inputMode="numeric"
              value={registro}
              onChange={(e) => filtrar(setRegistro)(e.target.value.replace(/\D/g, ''))}
              className={cn(claseControl, 'cifras h-10')}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
            <span className="text-sm font-medium">Operación</span>
            <Segmentos
              etiqueta="Operación"
              valor={operacion}
              alCambiar={filtrar(setOperacion)}
              opciones={[
                { valor: 'todas', etiqueta: 'Todas' },
                { valor: 'INSERT', etiqueta: 'INSERT' },
                { valor: 'UPDATE', etiqueta: 'UPDATE' },
                { valor: 'DELETE', etiqueta: 'DELETE' },
              ]}
            />
          </div>
        </div>
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <div className="p-4">
            <ErrorCarga error={consulta.error} />
          </div>
        ) : consulta.data.datos.length === 0 ? (
          <Vacio>Sin registros con esos filtros.</Vacio>
        ) : (
          <div className={cn(consulta.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <Tabla minimo="60rem">
              <thead>
                <tr>
                  <Th>
                    <span className="sr-only">Detalle</span>
                  </Th>
                  <Th numerico>#</Th>
                  <Th>Fecha</Th>
                  <Th>Tabla</Th>
                  <Th>Operación</Th>
                  <Th numerico>Registro</Th>
                  <Th>Rol app</Th>
                  <Th>Rol BD</Th>
                  <Th>Usuario</Th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.datos.map((r) => {
                  const expandido = abierto === r.id_bitacora;
                  return (
                    <Fragment key={r.id_bitacora}>
                      <Fila
                        className="cursor-pointer [@media(hover:hover)]:hover:bg-hundido"
                        onClick={() => setAbierto(expandido ? null : r.id_bitacora)}
                      >
                        <Td className="w-8">
                          <button
                            type="button"
                            aria-expanded={expandido}
                            aria-label={`Ver valores del registro ${r.id_bitacora}`}
                            className="grid place-items-center"
                          >
                            <ChevronRight
                              className={cn(
                                'size-4 text-tenue transition-transform duration-150 ease-(--ease-out)',
                                expandido && 'rotate-90',
                              )}
                              aria-hidden
                            />
                          </button>
                        </Td>
                        <Td numerico className="text-tenue">
                          {numero(r.id_bitacora)}
                        </Td>
                        <Td className="cifras whitespace-nowrap">{fechaHora(r.fecha)}</Td>
                        <Td className="font-mono text-xs">{r.tabla}</Td>
                        <Td>
                          <Badge tono={TONO_OP[r.operacion]}>{r.operacion}</Badge>
                        </Td>
                        <Td numerico>{r.id_registro !== null ? numero(r.id_registro) : '—'}</Td>
                        <Td className="font-mono text-xs">{r.rol_app ?? '—'}</Td>
                        <Td className="font-mono text-xs text-tenue">{r.usuario_bd}</Td>
                        <Td className="max-w-48 truncate" title={r.nombre_usuario ?? undefined}>
                          {r.nombre_usuario ?? (r.usuario_app ? `#${r.usuario_app}` : 'Sistema')}
                        </Td>
                      </Fila>
                      {expandido && (
                        <tr className="bg-hundido/60">
                          <td colSpan={9} className="px-4 py-3 sm:px-5">
                            <Diferencias r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Tabla>
            <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
          </div>
        )}
      </Card>
    </div>
  );
}
