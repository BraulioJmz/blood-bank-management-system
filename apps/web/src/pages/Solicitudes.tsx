import { useQuery } from '@tanstack/react-query';
import { Ban, Plus, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { useCatalogos, useMutacion } from '../api/hooks';
import type { Pagina, Solicitud, SolicitudDetalle, UnidadCompatible } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { Progreso } from '../components/dominio/Progreso';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Campo';
import { Card } from '../components/ui/Card';
import { Dialogo } from '../components/ui/Dialogo';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { Input } from '../components/ui/Input';
import { Paginacion } from '../components/ui/Paginacion';
import { Segmentos } from '../components/ui/Segmentos';
import { Fila, Tabla, Td, Th } from '../components/ui/Tabla';
import {
  TONO_ESTADO_SOLICITUD,
  TONO_ESTADO_UNIDAD,
  TONO_PRIORIDAD,
  TONO_SEMAFORO,
} from '../components/ui/tonos';
import { cn } from '../lib/cn';
import { dias, fecha, fechaCortaHora, fechaHora, numero } from '../lib/formato';

type Filtro = 'abiertas' | 'pendiente' | 'parcial' | 'surtida' | 'cancelada' | 'todas';
const TAMANO = 25;
const INVALIDAR = [['solicitudes'], ['dashboard'], ['inventario']];
const abierta = (estado: string) => estado === 'pendiente' || estado === 'parcial';

function NuevaSolicitud({ abierto, alCambiar }: { abierto: boolean; alCambiar: (a: boolean) => void }) {
  const catalogos = useCatalogos();
  const crear = useMutacion({
    fn: (d: Record<string, unknown>) =>
      api<{ id_solicitud: number }>('/solicitudes', { method: 'POST', json: d }),
    exito: (r) => `Solicitud #${r.id_solicitud} enviada`,
    descripcion: () => 'El banco de sangre la verá en su lista de pendientes.',
    error: 'No se envió la solicitud',
    invalidar: INVALIDAR,
    alTerminar: () => alCambiar(false),
  });
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    crear.mutate({
      id_tipo_sanguineo: Number(f.get('id_tipo_sanguineo')),
      id_componente: Number(f.get('id_componente')),
      cantidad: Number(f.get('cantidad')),
      prioridad: String(f.get('prioridad')),
    });
  }
  return (
    <Dialogo
      abierto={abierto}
      alCambiar={alCambiar}
      titulo="Nueva solicitud"
      descripcion="Se registra a nombre de tu hospital; la base de datos lo verifica (RLS)."
      pie={
        <>
          <Button onClick={() => alCambiar(false)}>Cancelar</Button>
          <Button type="submit" form="form-solicitud" variante="primario" cargando={crear.isPending}>
            Enviar solicitud
          </Button>
        </>
      }
    >
      <form id="form-solicitud" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Select etiqueta="Tipo sanguíneo" name="id_tipo_sanguineo" required defaultValue="">
          <option value="" disabled>
            Selecciona…
          </option>
          {catalogos.data?.tipos.map((t) => (
            <option key={t.id_tipo_sanguineo} value={t.id_tipo_sanguineo}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
        <Select etiqueta="Componente" name="id_componente" required defaultValue="">
          <option value="" disabled>
            Selecciona…
          </option>
          {catalogos.data?.componentes.map((c) => (
            <option key={c.id_componente} value={c.id_componente}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Input
          etiqueta="Cantidad de unidades"
          name="cantidad"
          type="number"
          min={1}
          max={50}
          defaultValue={1}
          required
        />
        <Select etiqueta="Prioridad" name="prioridad" defaultValue="normal">
          <option value="normal">Normal</option>
          <option value="urgente">Urgente</option>
          <option value="emergencia">Emergencia</option>
        </Select>
      </form>
    </Dialogo>
  );
}

/** Unidades compatibles en orden FEFO; asignar pide confirmación en la misma fila. */
function AsignacionManual({ s }: { s: SolicitudDetalle }) {
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const compatibles = useQuery({
    queryKey: ['inventario', 'compatibles', s.id_solicitud],
    queryFn: () => api<UnidadCompatible[]>(`/inventario/compatibles/${s.id_solicitud}`),
  });
  const asignar = useMutacion({
    fn: (id_unidad: number) =>
      api<{ estado_solicitud: string }>(`/solicitudes/${s.id_solicitud}/asignar`, {
        method: 'POST',
        json: { id_unidad },
      }),
    exito: (_r, id) => `Unidad #${numero(id)} asignada`,
    descripcion: (r) => `La solicitud quedó ${r.estado_solicitud}.`,
    error: 'No se asignó la unidad',
    invalidar: INVALIDAR,
    alTerminar: () => setConfirmar(null),
  });

  if (compatibles.isPending) return <Cargando texto="Buscando unidades compatibles…" />;
  if (compatibles.isError) return <ErrorCarga error={compatibles.error} />;
  if (compatibles.data.length === 0)
    return (
      <Vacio>
        No hay unidades disponibles de {s.tipo} · {s.componente}.
      </Vacio>
    );

  return (
    <ul className="max-h-72 divide-y divide-borde overflow-y-auto rounded-control border border-borde">
      {compatibles.data.map((u, i) => (
        <li key={u.id_unidad} className="flex h-12 items-center gap-3 px-3 text-sm">
          <span className="cifras min-w-20 shrink-0 font-medium whitespace-nowrap">
            #{numero(u.id_unidad)}
          </span>
          <span className="cifras min-w-0 flex-1 truncate text-tenue">
            caduca {fecha(u.fecha_caducidad)}
            {i === 0 && <span className="ml-2 text-xs text-info">primera en caducar</span>}
          </span>
          <Badge tono={TONO_SEMAFORO[u.semaforo]}>{dias(Number(u.dias_restantes))}</Badge>
          {confirmar === u.id_unidad ? (
            <div className="flex gap-1">
              <Button tamano="sm" variante="fantasma" onClick={() => setConfirmar(null)}>
                No
              </Button>
              <Button
                tamano="sm"
                variante="primario"
                cargando={asignar.isPending}
                onClick={() => asignar.mutate(u.id_unidad)}
              >
                Confirmar
              </Button>
            </div>
          ) : (
            <Button tamano="sm" onClick={() => setConfirmar(u.id_unidad)} disabled={asignar.isPending}>
              Asignar
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DetalleSolicitud({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const [paso, setPaso] = useState<'ver' | 'fefo' | 'cancelar'>('ver');
  const detalle = useQuery({
    queryKey: ['solicitudes', 'detalle', id],
    queryFn: () => api<SolicitudDetalle>(`/solicitudes/${id}`),
    enabled: id !== null,
  });
  const cerrar = () => {
    setPaso('ver');
    alCerrar();
  };
  const fefo = useMutacion({
    fn: () =>
      api<{ asignadas: number; estado_solicitud: string }>(`/solicitudes/${id}/asignar-automatica`, {
        method: 'POST',
      }),
    exito: (r) =>
      r.asignadas === 0
        ? 'No había unidades compatibles'
        : `${r.asignadas} ${r.asignadas === 1 ? 'unidad asignada' : 'unidades asignadas'} por FEFO`,
    descripcion: (r) => `La solicitud quedó ${r.estado_solicitud}.`,
    error: 'No se completó la asignación automática',
    invalidar: INVALIDAR,
    alTerminar: () => setPaso('ver'),
  });
  const cancelar = useMutacion({
    fn: () => api(`/solicitudes/${id}/cancelar`, { method: 'POST' }),
    exito: () => `Solicitud #${id} cancelada`,
    error: 'No se canceló la solicitud',
    invalidar: INVALIDAR,
    alTerminar: () => setPaso('ver'),
  });

  const s = detalle.data;
  const faltan = s ? s.cantidad - s.asignaciones.length : 0;
  const esInventario = usuario?.rol === 'inventario';
  // fn_cancelar_solicitud solo acepta solicitudes 'pendiente' (sin unidades asignadas; BS010).
  const puedeCancelar = s && s.estado === 'pendiente' && (usuario?.rol === 'hospital' || esInventario);

  return (
    <Dialogo
      abierto={id !== null}
      alCambiar={(a) => !a && cerrar()}
      titulo={`Solicitud #${id !== null ? numero(id) : ''}`}
      descripcion={s && `${s.hospital} · ${fechaHora(s.fecha_solicitud)}`}
      ancho="lg"
      pie={
        s &&
        (paso === 'fefo' ? (
          <>
            <p className="mr-auto self-center text-sm text-tenue">
              Se asignarán hasta {faltan} unidades que caducan primero.
            </p>
            <Button onClick={() => setPaso('ver')}>Volver</Button>
            <Button variante="primario" cargando={fefo.isPending} onClick={() => fefo.mutate(undefined)}>
              Confirmar FEFO
            </Button>
          </>
        ) : paso === 'cancelar' ? (
          <>
            <p className="mr-auto self-center text-sm text-tenue">No se puede deshacer.</p>
            <Button onClick={() => setPaso('ver')}>Volver</Button>
            <Button
              variante="peligro"
              cargando={cancelar.isPending}
              onClick={() => cancelar.mutate(undefined)}
            >
              Cancelar solicitud
            </Button>
          </>
        ) : (
          (puedeCancelar || (esInventario && abierta(s.estado))) && (
            <>
              {puedeCancelar && (
                <Button
                  variante="fantasma"
                  className="mr-auto text-peligro"
                  onClick={() => setPaso('cancelar')}
                >
                  <Ban className="size-4" aria-hidden />
                  Cancelar solicitud
                </Button>
              )}
              {esInventario && abierta(s.estado) && (
                <Button variante="primario" onClick={() => setPaso('fefo')}>
                  <Zap className="size-4" aria-hidden />
                  Asignar automáticamente (FEFO)
                </Button>
              )}
            </>
          )
        ))
      }
    >
      {detalle.isError ? (
        <ErrorCarga error={detalle.error} />
      ) : !s ? (
        <Cargando />
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
            <div>
              <dt className="text-xs text-tenue">Tipo</dt>
              <dd className="cifras text-lg font-semibold">{s.tipo}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-tenue">Componente</dt>
              <dd className="truncate font-medium" title={s.componente}>
                {s.componente}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-tenue">Prioridad</dt>
              <dd>
                <Badge tono={TONO_PRIORIDAD[s.prioridad]}>{s.prioridad}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-tenue">Estado</dt>
              <dd>
                <Badge tono={TONO_ESTADO_SOLICITUD[s.estado]}>{s.estado}</Badge>
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="mb-1 text-xs text-tenue">Avance</dt>
              <dd>
                <Progreso asignadas={s.asignaciones.length} cantidad={s.cantidad} />
              </dd>
            </div>
          </dl>

          {esInventario && abierta(s.estado) && paso === 'ver' && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Asignación manual · faltan {faltan}</h3>
              <AsignacionManual s={s} />
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Unidades asignadas ({s.asignaciones.length})</h3>
            {s.asignaciones.length === 0 ? (
              <Vacio>Todavía no se asignan unidades.</Vacio>
            ) : (
              <ul className="divide-y divide-borde rounded-control border border-borde">
                {s.asignaciones.map((a) => (
                  <li
                    key={a.id_asignacion}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                  >
                    <span className="cifras min-w-20 shrink-0 font-medium whitespace-nowrap">
                      #{numero(a.id_unidad)}
                    </span>
                    <Badge tono={TONO_ESTADO_UNIDAD[a.estado_unidad]}>{a.estado_unidad}</Badge>
                    <span className="cifras text-tenue">caduca {fecha(a.fecha_caducidad)}</span>
                    <span className="ml-auto truncate text-xs text-tenue" title={a.autorizo}>
                      {a.autorizo} · {fechaHora(a.fecha_asignacion)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialogo>
  );
}

export function Solicitudes() {
  const { usuario } = useSesion();
  const esHospital = usuario?.rol === 'hospital';
  const [filtro, setFiltro] = useState<Filtro>('abiertas');
  const [pagina, setPagina] = useState(1);
  const [nueva, setNueva] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const consulta = useQuery({
    queryKey: ['solicitudes', filtro, pagina],
    queryFn: () =>
      api<Pagina<Solicitud>>(
        `/solicitudes?${new URLSearchParams({
          ...(filtro !== 'todas' && { estado: filtro }),
          pagina: String(pagina),
          tamano: String(TAMANO),
        })}`,
      ),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Solicitudes"
        descripcion={
          esHospital
            ? 'Solicitudes de tu hospital. La base de datos solo te muestra las tuyas (RLS).'
            : 'Solicitudes de todos los hospitales, por prioridad clínica y antigüedad'
        }
        acciones={
          esHospital && (
            <Button variante="primario" onClick={() => setNueva(true)}>
              <Plus className="size-4" aria-hidden />
              Nueva solicitud
            </Button>
          )
        }
      />
      <Segmentos
        etiqueta="Estado"
        valor={filtro}
        alCambiar={(v) => {
          setFiltro(v);
          setPagina(1);
        }}
        opciones={[
          { valor: 'abiertas', etiqueta: 'Abiertas' },
          { valor: 'pendiente', etiqueta: 'Pendientes' },
          { valor: 'parcial', etiqueta: 'Parciales' },
          { valor: 'surtida', etiqueta: 'Surtidas' },
          { valor: 'cancelada', etiqueta: 'Canceladas' },
          { valor: 'todas', etiqueta: 'Todas' },
        ]}
      />
      <Card>
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <div className="p-4">
            <ErrorCarga error={consulta.error} />
          </div>
        ) : consulta.data.datos.length === 0 ? (
          <Vacio>No hay solicitudes en este estado.</Vacio>
        ) : (
          <div className={cn(consulta.isPlaceholderData && 'opacity-60 transition-opacity')}>
            {/* Móvil: lista con lo urgente arriba (prioridad, estado, avance); la tabla oculta columnas tras scroll. */}
            <ul className="divide-y divide-borde md:hidden">
              {consulta.data.datos.map((s) => (
                <li key={s.id_solicitud}>
                  <button
                    type="button"
                    onClick={() => setAbierto(s.id_solicitud)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3 text-left active:bg-hundido"
                  >
                    <span className="flex items-center gap-2">
                      <span className="cifras font-semibold">#{numero(s.id_solicitud)}</span>
                      <Badge tono={TONO_PRIORIDAD[s.prioridad]}>{s.prioridad}</Badge>
                      <span className="ml-auto">
                        <Badge tono={TONO_ESTADO_SOLICITUD[s.estado]}>{s.estado}</Badge>
                      </span>
                    </span>
                    {!esHospital && (
                      <span className="truncate text-sm" title={s.hospital}>
                        {s.hospital}
                      </span>
                    )}
                    <span className="flex min-w-0 items-center gap-2 text-sm text-tenue">
                      <span className="cifras font-semibold text-texto">{s.tipo}</span>
                      <span className="truncate">{s.componente}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="flex-1">
                        <Progreso asignadas={s.asignadas} cantidad={s.cantidad} />
                      </span>
                      <span className="cifras text-xs text-tenue">{fechaCortaHora(s.fecha_solicitud)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Tabla minimo="56rem">
                <thead>
                  <tr>
                    <Th numerico>#</Th>
                    {!esHospital && <Th>Hospital</Th>}
                    <Th>Tipo</Th>
                    <Th>Componente</Th>
                    <Th>Avance</Th>
                    <Th>Prioridad</Th>
                    <Th>Estado</Th>
                    <Th>Fecha</Th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.datos.map((s) => (
                    <Fila
                      key={s.id_solicitud}
                      onClick={() => setAbierto(s.id_solicitud)}
                      className="cursor-pointer [@media(hover:hover)]:hover:bg-hundido"
                    >
                      <Td numerico>
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAbierto(s.id_solicitud);
                          }}
                        >
                          {numero(s.id_solicitud)}
                        </button>
                      </Td>
                      {!esHospital && (
                        <Td className="max-w-60 truncate" title={s.hospital}>
                          {s.hospital}
                        </Td>
                      )}
                      <Td className="cifras font-semibold">{s.tipo}</Td>
                      <Td className="max-w-56 truncate" title={s.componente}>
                        {s.componente}
                      </Td>
                      <Td>
                        <Progreso asignadas={s.asignadas} cantidad={s.cantidad} />
                      </Td>
                      <Td>
                        <Badge tono={TONO_PRIORIDAD[s.prioridad]}>{s.prioridad}</Badge>
                      </Td>
                      <Td>
                        <Badge tono={TONO_ESTADO_SOLICITUD[s.estado]}>{s.estado}</Badge>
                      </Td>
                      <Td
                        className="cifras whitespace-nowrap text-tenue"
                        title={fechaHora(s.fecha_solicitud)}
                      >
                        {fechaCortaHora(s.fecha_solicitud)}
                      </Td>
                    </Fila>
                  ))}
                </tbody>
              </Tabla>
            </div>
            <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
          </div>
        )}
      </Card>
      <NuevaSolicitud abierto={nueva} alCambiar={setNueva} />
      <DetalleSolicitud id={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}
