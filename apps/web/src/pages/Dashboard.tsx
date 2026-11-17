import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ClipboardList, Droplet, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../api/cliente';
import type { Dashboard as DatosDashboard, FilaDisponibilidad, UnidadPorCaducar } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { TONO_ESTADO_UNIDAD, TONO_PRIORIDAD, TONO_SEMAFORO, type Tono } from '../components/ui/tonos';
import { cn } from '../lib/cn';
import { dias, fechaCorta, hora, numero } from '../lib/formato';

const TIPOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ESTADOS = ['cuarentena', 'disponible', 'asignada', 'entregada', 'caducada', 'descartada'];

function Kpi({
  etiqueta,
  valor,
  icono: Icono,
  tono = 'neutro',
  detalle,
}: {
  etiqueta: string;
  valor: number;
  icono: LucideIcon;
  tono?: Tono;
  detalle?: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-tenue">
        <span>{etiqueta}</span>
        <Icono
          className={cn('size-4', {
            'text-ok': tono === 'ok',
            'text-aviso': tono === 'aviso',
            'text-peligro': tono === 'peligro',
            'text-info': tono === 'info',
          })}
          aria-hidden
        />
      </div>
      <p className="cifras text-2xl font-semibold tracking-tight">{numero(valor)}</p>
      {detalle && <p className="text-xs text-tenue">{detalle}</p>}
    </Card>
  );
}

/** Matriz componente × tipo: rojo solo en 0, ámbar por debajo del umbral, neutro lo demás. */
function MatrizDisponibilidad({ filas, umbral }: { filas: FilaDisponibilidad[]; umbral: number }) {
  const componentes = [...new Map(filas.map((f) => [f.id_componente, f.componente])).entries()];
  const celda = (idc: number, tipo: string) => filas.find((f) => f.id_componente === idc && f.tipo === tipo);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-xs text-tenue">
            <th className="px-4 py-2 text-left font-medium sm:px-5">Componente</th>
            {TIPOS.map((t) => (
              <th key={t} className="px-1.5 py-2 text-center font-medium">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {componentes.map(([idc, nombre]) => (
            <tr key={idc} className="border-t border-borde">
              <th scope="row" className="px-4 py-2.5 text-left font-medium sm:px-5">
                {nombre}
              </th>
              {TIPOS.map((t) => {
                const n = Number(celda(idc, t)?.disponibles ?? 0);
                return (
                  <td key={t} className="px-1.5 py-1.5 text-center">
                    <span
                      className={cn(
                        'cifras inline-flex h-8 min-w-11 items-center justify-center rounded-control px-2',
                        n === 0 && 'bg-peligro-suave font-medium text-peligro',
                        n > 0 && n < umbral && 'bg-aviso-suave font-medium text-aviso',
                      )}
                    >
                      {numero(n)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borde px-4 py-2.5 text-xs text-tenue sm:px-5">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-peligro-suave ring-1 ring-peligro/30" aria-hidden /> Sin
          existencias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-aviso-suave ring-1 ring-aviso/30" aria-hidden /> Menos de{' '}
          {umbral}
        </span>
      </p>
    </div>
  );
}

/** Unidades disponibles que caducan primero, cada una con el umbral de su componente. */
function ProximasACaducar({ unidades }: { unidades: UnidadPorCaducar[] }) {
  return (
    <Card>
      <CardHeader
        titulo="Próximas a caducar"
        descripcion="Según el umbral de cada componente · se asignan primero (FEFO)"
        accion={
          <Link to="/inventario" className="text-sm whitespace-nowrap text-info hover:underline">
            Inventario
          </Link>
        }
      />
      {unidades.length === 0 ? (
        <Vacio>Ninguna unidad disponible está dentro de su umbral de caducidad.</Vacio>
      ) : (
        <ul className="divide-y divide-borde">
          {unidades.map((u) => (
            <li key={u.id_unidad} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span className="cifras w-9 shrink-0 font-semibold">{u.tipo}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate" title={u.componente}>
                  {u.componente}
                </p>
                <p className="cifras truncate text-xs text-tenue">
                  #{u.id_unidad} · caduca {fechaCorta(u.fecha_caducidad)} · alerta a {u.dias_alerta_caducidad}{' '}
                  d
                </p>
              </div>
              <Badge tono={TONO_SEMAFORO[u.semaforo]}>{dias(Number(u.dias_restantes))}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Dashboard() {
  const { usuario } = useSesion();
  const consulta = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DatosDashboard>('/dashboard'),
    refetchInterval: 60_000,
  });

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <ErrorCarga error={consulta.error} />;

  const d = consulta.data;
  const totalDisponibles = d.disponibilidad.reduce((s, f) => s + Number(f.disponibles), 0);
  const veSolicitudes = !!usuario && ['hospital', 'inventario', 'admin'].includes(usuario.rol);
  const porEstado = (estado: string) =>
    d.por_estado.filter((f) => f.estado === estado).reduce((s, f) => s + Number(f.total), 0);
  const columnaLateral = veSolicitudes || d.alertas.proximas_a_caducar !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Panel</h1>
          <p className="text-sm text-tenue">
            Existencias actualizadas a las {hora(d.refrescado_en)}
            {d.caducadas_ahora > 0 && ` · ${d.caducadas_ahora} unidades se marcaron como caducadas`}
          </p>
        </div>
        <Button tamano="sm" onClick={() => consulta.refetch()} cargando={consulta.isFetching}>
          {!consulta.isFetching && <RefreshCw className="size-4" aria-hidden />}
          Actualizar
        </Button>
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Unidades disponibles" valor={totalDisponibles} icono={Droplet} tono="ok" />
        <Kpi
          etiqueta="Por caducar"
          valor={d.alertas.por_caducar}
          icono={CalendarClock}
          tono={d.alertas.por_caducar > 0 ? 'aviso' : 'neutro'}
          detalle="Dentro del umbral de su componente"
        />
        <Kpi
          etiqueta="Existencias bajas"
          valor={d.alertas.existencias_bajas.length}
          icono={AlertTriangle}
          tono={d.alertas.existencias_bajas.length > 0 ? 'peligro' : 'neutro'}
          detalle={`Combinaciones con menos de ${d.alertas.umbral_bajo}`}
        />
        {veSolicitudes ? (
          <Kpi
            etiqueta="Solicitudes abiertas"
            valor={d.alertas.solicitudes_abiertas}
            icono={ClipboardList}
            tono="info"
            detalle={`${d.alertas.solicitudes_urgentes.length} urgentes o de emergencia`}
          />
        ) : (
          <Kpi etiqueta="En cuarentena" valor={porEstado('cuarentena')} icono={ClipboardList} tono="aviso" />
        )}
      </section>

      <div className={cn('grid items-start gap-6', columnaLateral && 'xl:grid-cols-[minmax(0,1fr)_24rem]')}>
        <Card className="min-w-0">
          <CardHeader
            titulo="Disponibilidad por tipo y componente"
            descripcion="Unidades disponibles y vigentes"
          />
          <MatrizDisponibilidad filas={d.disponibilidad} umbral={d.alertas.umbral_bajo} />
        </Card>

        {columnaLateral && (
          <div className="flex min-w-0 flex-col gap-6">
            {d.alertas.proximas_a_caducar && <ProximasACaducar unidades={d.alertas.proximas_a_caducar} />}
            {veSolicitudes && (
              <Card>
                <CardHeader
                  titulo="Solicitudes urgentes"
                  accion={
                    <Link to="/solicitudes" className="text-sm whitespace-nowrap text-info hover:underline">
                      Ver todas
                    </Link>
                  }
                />
                {d.alertas.solicitudes_urgentes.length === 0 ? (
                  <Vacio>Sin solicitudes urgentes pendientes.</Vacio>
                ) : (
                  <ul className="max-h-96 divide-y divide-borde overflow-y-auto">
                    {d.alertas.solicitudes_urgentes.map((s) => (
                      <li key={s.id_solicitud} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={s.hospital}>
                            {s.hospital}
                          </p>
                          <p className="cifras truncate text-xs text-tenue">
                            #{s.id_solicitud} · {s.tipo} · {s.componente} · {s.asignadas}/{s.cantidad}
                          </p>
                        </div>
                        <Badge tono={TONO_PRIORIDAD[s.prioridad]}>{s.prioridad}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader
          titulo="Unidades por estado"
          descripcion="Todas las unidades registradas, por componente"
        />
        <div className="overflow-x-auto">
          <table className="cifras w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-xs text-tenue">
                <th className="px-4 py-2 text-left font-medium sm:px-5">Componente</th>
                {ESTADOS.map((e) => (
                  <th key={e} className="px-4 py-2 text-right font-medium last:sm:pr-5">
                    <Badge tono={TONO_ESTADO_UNIDAD[e]}>{e}</Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(d.por_estado.map((f) => f.componente))].map((comp) => (
                <tr key={comp} className="border-t border-borde">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium sm:px-5">
                    {comp}
                  </th>
                  {ESTADOS.map((e) => (
                    <td key={e} className="px-4 py-2.5 text-right last:sm:pr-5">
                      {numero(d.por_estado.find((f) => f.componente === comp && f.estado === e)?.total ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
