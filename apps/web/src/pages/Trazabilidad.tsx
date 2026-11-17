import { useQuery } from '@tanstack/react-query';
import { Droplet, FlaskConical, Hospital, Package, Search, User } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api/cliente';
import type { Trazabilidad as Datos } from '../api/tipos';
import { ResumenTamizaje } from '../components/dominio/Tamizaje';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { claseControl } from '../components/ui/estilos';
import { TONO_ESTADO_SOLICITUD, TONO_ESTADO_UNIDAD, TONO_PRIORIDAD } from '../components/ui/tonos';
import { cn } from '../lib/cn';
import { fecha, fechaHora, numero } from '../lib/formato';

/** Un eslabón de la cadena: ícono, título y datos. La línea vertical une los eslabones. */
function Eslabon({
  icono: Icono,
  titulo,
  children,
  ultimo,
}: {
  icono: typeof Droplet;
  titulo: string;
  children: ReactNode;
  ultimo?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!ultimo && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-borde" aria-hidden />}
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-hundido text-tenue">
        <Icono className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-tenue">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Cadena({ d, alIr }: { d: Datos; alIr: (id: number) => void }) {
  return (
    <ol>
      <Eslabon icono={Droplet} titulo={`Unidad #${numero(d.id_unidad)}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="cifras rounded-control bg-acento-suave px-2 py-0.5 text-sm font-semibold text-acento">
            {d.tipo}
          </span>
          <span className="text-sm font-medium">{d.componente}</span>
          <Badge tono={TONO_ESTADO_UNIDAD[d.estado]}>{d.estado}</Badge>
        </div>
        <Datos
          filas={[
            ['Obtención', fecha(d.fecha_obtencion)],
            ['Caducidad', fecha(d.fecha_caducidad)],
          ]}
        />
      </Eslabon>
      <Eslabon icono={FlaskConical} titulo={`Donación #${numero(d.id_donacion)}`}>
        <Datos
          filas={[
            ['Fecha', fechaHora(d.fecha_donacion)],
            ['Tipo', d.tipo_donacion],
            ['Volumen', `${numero(d.volumen_ml)} ml`],
            ['Capturó', d.capturo],
          ]}
        />
        <div className="mt-3">
          <ResumenTamizaje
            pruebas={d.pruebas && Object.fromEntries(d.pruebas.map((p) => [p.tipo, p.resultado]))}
          />
        </div>
        {d.hermanas && d.hermanas.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-tenue">Unidades hermanas (misma donación)</p>
            <ul className="flex flex-wrap gap-1.5">
              {d.hermanas.map((h) => (
                <li key={h.id_unidad}>
                  <button
                    type="button"
                    onClick={() => alIr(h.id_unidad)}
                    className="inline-flex items-center gap-1.5 rounded-control border border-borde px-2 py-1 text-xs hover:bg-hundido"
                  >
                    <span className="cifras font-medium">#{numero(h.id_unidad)}</span>
                    <span className="text-tenue">{h.componente}</span>
                    <Badge tono={TONO_ESTADO_UNIDAD[h.estado]}>{h.estado}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Eslabon>
      <Eslabon icono={User} titulo="Donante">
        <Datos
          filas={[
            ['Nombre', `${d.donante} (#${numero(d.id_donante)})`],
            ['Sexo', d.sexo === 'F' ? 'Femenino' : 'Masculino'],
            ['Nacimiento', fecha(d.fecha_nacimiento)],
          ]}
        />
      </Eslabon>
      <Eslabon icono={Hospital} titulo="Destino" ultimo={d.movimientos.length === 0}>
        {d.id_asignacion ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{d.hospital}</span>
              {d.prioridad && <Badge tono={TONO_PRIORIDAD[d.prioridad]}>{d.prioridad}</Badge>}
              {d.estado_solicitud && (
                <Badge tono={TONO_ESTADO_SOLICITUD[d.estado_solicitud]}>{d.estado_solicitud}</Badge>
              )}
            </div>
            <Datos
              filas={[
                ['Solicitud', `#${numero(d.id_solicitud ?? 0)}`],
                ['Asignada', d.fecha_asignacion ? fechaHora(d.fecha_asignacion) : '—'],
                ['Autorizó', d.autorizo ?? '—'],
              ]}
            />
          </>
        ) : (
          <p className="text-sm text-tenue">Sin asignar a ninguna solicitud.</p>
        )}
      </Eslabon>
      {d.movimientos.length > 0 && (
        <Eslabon icono={Package} titulo={`Movimientos (${d.movimientos.length})`} ultimo>
          <ul className="flex flex-col gap-2">
            {d.movimientos.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="cifras text-xs text-tenue">{fechaHora(m.fecha_movimiento)}</span>{' '}
                <span className="font-medium">{m.tipo_movimiento.replace('_', ' ')}</span>
                {m.motivo && <span className="text-tenue"> · {m.motivo}</span>}
                <span className="text-xs text-tenue"> — {m.usuario}</span>
              </li>
            ))}
          </ul>
        </Eslabon>
      )}
    </ol>
  );
}

export function Trazabilidad() {
  const [params, setParams] = useSearchParams();
  const id = params.get('unidad');
  const [texto, setTexto] = useState(id ?? '');
  const consulta = useQuery({
    queryKey: ['trazabilidad', id],
    queryFn: () => api<Datos>(`/trazabilidad/unidades/${id}`),
    enabled: !!id,
    retry: false,
  });
  const ir = (n: number | string) => {
    setTexto(String(n));
    setParams({ unidad: String(n) });
  };
  function buscar(e: FormEvent) {
    e.preventDefault();
    if (/^\d+$/.test(texto.trim())) ir(texto.trim());
  }

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Trazabilidad"
        descripcion="Cadena completa de una unidad: donación, donante, tamizaje, unidades hermanas y destino (hemovigilancia)"
      />
      <form onSubmit={buscar} className="flex max-w-md gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Número de unidad</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tenue"
            aria-hidden
          />
          <input
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
            placeholder="Número de unidad"
            className={cn(claseControl, 'cifras h-10 pl-9')}
            autoFocus
          />
        </label>
        <Button type="submit" variante="primario">
          Rastrear
        </Button>
      </form>
      <Card className="p-4 sm:p-6">
        {!id ? (
          <Vacio>Escribe el número de una unidad para ver su cadena completa.</Vacio>
        ) : consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <ErrorCarga error={consulta.error} />
        ) : (
          <Cadena d={consulta.data} alIr={ir} />
        )}
      </Card>
    </div>
  );
}
