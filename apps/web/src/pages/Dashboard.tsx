import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, ClipboardList, Droplet, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../api/cliente';
import type { Dashboard as DatosDashboard, FilaDisponibilidad } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { Badge } from '../components/ui/Badge';
import { TONO_ESTADO_UNIDAD, TONO_PRIORIDAD, type Tono } from '../components/ui/tonos';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { cn } from '../lib/cn';

const TIPOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ESTADOS = ['cuarentena', 'disponible', 'asignada', 'entregada', 'caducada', 'descartada'];

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });

const fecha = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

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
      <p className="cifras text-2xl font-semibold tracking-tight">{valor.toLocaleString('es-MX')}</p>
      {detalle && <p className="text-xs text-tenue">{detalle}</p>}
    </Card>
  );
}

/** Matriz componente × tipo sanguíneo; la celda se colorea por nivel de existencias. */
function MatrizDisponibilidad({ filas, umbral }: { filas: FilaDisponibilidad[]; umbral: number }) {
  const componentes = [...new Map(filas.map((f) => [f.id_componente, f.componente])).entries()];
  const celda = (idc: number, tipo: string) => filas.find((f) => f.id_componente === idc && f.tipo === tipo);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-tenue">
            <th className="px-4 py-2 font-medium sm:px-5">Componente</th>
            {TIPOS.map((t) => (
              <th key={t} className="px-2 py-2 text-center font-medium">
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
                const f = celda(idc, t);
                const n = Number(f?.disponibles ?? 0);
                const porCaducar = Number(f?.por_caducar_7d ?? 0);
                return (
                  <td key={t} className="px-1.5 py-1.5 text-center">
                    <span
                      title={
                        porCaducar
                          ? `${n} disponibles · ${porCaducar} caducan en ≤ 7 días`
                          : `${n} disponibles`
                      }
                      className={cn(
                        'cifras inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-control px-2',
                        n === 0
                          ? 'bg-peligro-suave font-medium text-peligro'
                          : n < umbral
                            ? 'bg-aviso-suave font-medium text-aviso'
                            : 'text-texto',
                      )}
                    >
                      {n}
                      {porCaducar > 0 && <span className="size-1.5 rounded-full bg-aviso" aria-hidden />}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borde px-4 py-2.5 text-xs text-tenue sm:px-5">
        <span>
          <span className="mr-1 inline-block size-2 rounded-sm bg-peligro-suave ring-1 ring-peligro/30" /> Sin
          existencias
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-sm bg-aviso-suave ring-1 ring-aviso/30" /> Menos
          de {umbral}
        </span>
        <span>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-aviso" /> Con unidades que caducan en ≤
          7 días
        </span>
      </p>
    </div>
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
  const veSolicitudes = usuario && ['hospital', 'inventario', 'admin'].includes(usuario.rol);
  const porEstado = (estado: string) =>
    d.por_estado.filter((f) => f.estado === estado).reduce((s, f) => s + Number(f.total), 0);

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
        <Button
          tamano="sm"
          onClick={() => consulta.refetch()}
          cargando={consulta.isFetching}
          aria-label="Actualizar panel"
        >
          {!consulta.isFetching && <RefreshCw className="size-4" aria-hidden />}
          Actualizar
        </Button>
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Unidades disponibles" valor={totalDisponibles} icono={Droplet} tono="ok" />
        <Kpi
          etiqueta="Caducan en ≤ 7 días"
          valor={d.alertas.por_caducar_7d}
          icono={CalendarClock}
          tono={d.alertas.por_caducar_7d > 0 ? 'aviso' : 'neutro'}
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

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="min-w-0">
          <CardHeader
            titulo="Disponibilidad por tipo y componente"
            descripcion="Unidades disponibles y vigentes"
          />
          <MatrizDisponibilidad filas={d.disponibilidad} umbral={d.alertas.umbral_bajo} />
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          {veSolicitudes && (
            <Card>
              <CardHeader
                titulo="Solicitudes urgentes"
                accion={
                  <Link to="/solicitudes" className="text-sm text-info hover:underline">
                    Ver todas
                  </Link>
                }
              />
              {d.alertas.solicitudes_urgentes.length === 0 ? (
                <Vacio>Sin solicitudes urgentes pendientes.</Vacio>
              ) : (
                <ul className="divide-y divide-borde">
                  {d.alertas.solicitudes_urgentes.map((s) => (
                    <li key={s.id_solicitud} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={s.hospital}>
                          {s.hospital}
                        </p>
                        <p className="cifras text-xs text-tenue">
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

          <Card>
            <CardHeader
              titulo="Existencias bajas"
              descripcion={`Menos de ${d.alertas.umbral_bajo} unidades`}
            />
            {d.alertas.existencias_bajas.length === 0 ? (
              <Vacio>Todas las combinaciones tienen existencias suficientes.</Vacio>
            ) : (
              <ul className="max-h-80 divide-y divide-borde overflow-y-auto">
                {d.alertas.existencias_bajas.map((f) => (
                  <li
                    key={`${f.id_tipo_sanguineo}-${f.id_componente}`}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5"
                  >
                    <span className="cifras w-9 font-semibold">{f.tipo}</span>
                    <span className="min-w-0 flex-1 truncate text-tenue" title={f.componente}>
                      {f.componente}
                    </span>
                    <span
                      className={cn(
                        'cifras font-medium',
                        Number(f.disponibles) === 0 ? 'text-peligro' : 'text-aviso',
                      )}
                    >
                      {f.disponibles}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          titulo="Unidades por estado"
          descripcion="Todas las unidades registradas, por componente"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-tenue">
                <th className="px-4 py-2 font-medium sm:px-5">Componente</th>
                {ESTADOS.map((e) => (
                  <th key={e} className="px-2 py-2 text-right font-medium">
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
                    <td key={e} className="cifras px-2 py-2.5 pr-4 text-right">
                      {Number(
                        d.por_estado.find((f) => f.componente === comp && f.estado === e)?.total ?? 0,
                      ).toLocaleString('es-MX')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ProximaCaducidad filas={d.disponibilidad} />
    </div>
  );
}

/** Las 5 combinaciones cuya unidad más próxima caduca primero (FEFO a la vista). */
function ProximaCaducidad({ filas }: { filas: FilaDisponibilidad[] }) {
  const proximas = filas
    .filter((f) => f.proxima_caducidad)
    .sort((a, b) => a.proxima_caducidad!.localeCompare(b.proxima_caducidad!))
    .slice(0, 5);
  if (proximas.length === 0) return null;
  return (
    <Card>
      <CardHeader titulo="Próximas a caducar" descripcion="Se asignan primero (FEFO)" />
      <ul className="divide-y divide-borde">
        {proximas.map((f) => (
          <li
            key={`${f.id_tipo_sanguineo}-${f.id_componente}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5"
          >
            <span className="cifras w-9 font-semibold">{f.tipo}</span>
            <span className="min-w-0 flex-1 truncate text-tenue">{f.componente}</span>
            <span className="cifras">{fecha(f.proxima_caducidad!)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
