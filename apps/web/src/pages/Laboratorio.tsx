import { useQuery } from '@tanstack/react-query';
import { Check, Clock, Scissors, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/cliente';
import { useCatalogos, useMutacion } from '../api/hooks';
import type { DonacionLab, Pagina, ResultadoPrueba } from '../api/tipos';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialogo } from '../components/ui/Dialogo';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { Paginacion } from '../components/ui/Paginacion';
import { Segmentos } from '../components/ui/Segmentos';
import { TONO_ESTADO_UNIDAD } from '../components/ui/tonos';
import { cn } from '../lib/cn';
import { fechaHora } from '../lib/formato';

type Filtro = 'pendientes' | 'tamizaje' | 'fraccionar' | 'todas';
const TAMANO = 12;
const INVALIDAR = [['laboratorio'], ['donaciones'], ['dashboard'], ['inventario']];

interface PruebaElegida {
  id_prueba: number;
  tipo: string;
  id_donacion: number;
}

function Prueba({
  prueba,
  id_donacion,
  alCapturar,
  alReactivo,
  ocupado,
}: {
  prueba: DonacionLab['pruebas'][number];
  id_donacion: number;
  alCapturar: (id: number, r: ResultadoPrueba) => void;
  alReactivo: (p: PruebaElegida) => void;
  ocupado: boolean;
}) {
  const r = prueba.resultado;
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-16 text-sm font-medium">{prueba.tipo}</span>
      {r === 'pendiente' ? (
        <div className="ml-auto flex gap-1.5">
          <Button tamano="sm" disabled={ocupado} onClick={() => alCapturar(prueba.id_prueba, 'no_reactivo')}>
            <Check className="size-3.5" aria-hidden />
            No reactivo
          </Button>
          <Button
            tamano="sm"
            variante="fantasma"
            className="text-peligro"
            disabled={ocupado}
            onClick={() => alReactivo({ id_prueba: prueba.id_prueba, tipo: prueba.tipo, id_donacion })}
          >
            <X className="size-3.5" aria-hidden />
            Reactivo
          </Button>
        </div>
      ) : (
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-sm',
            r === 'reactivo' ? 'font-medium text-peligro' : 'text-ok',
          )}
        >
          {r === 'reactivo' ? (
            <X className="size-3.5" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          {r === 'reactivo' ? 'Reactivo' : 'No reactivo'}
        </span>
      )}
    </li>
  );
}

function TarjetaDonacion({
  d,
  alReactivo,
  alFraccionar,
}: {
  d: DonacionLab;
  alReactivo: (p: PruebaElegida) => void;
  alFraccionar: (d: DonacionLab) => void;
}) {
  const capturar = useMutacion({
    fn: ({ id, resultado }: { id: number; resultado: ResultadoPrueba }) =>
      api<{ unidades: { estado: string }[] }>(`/laboratorio/pruebas/${id}`, {
        method: 'PATCH',
        json: { resultado },
      }),
    // El trigger de la BD libera las unidades cuando las 5 pruebas salen no reactivas.
    exito: (r) =>
      r.unidades.length > 0 && r.unidades.every((u) => u.estado === 'disponible')
        ? `Donación #${d.id_donacion} liberada`
        : 'Resultado registrado',
    descripcion: (r) =>
      r.unidades.length > 0 && r.unidades.every((u) => u.estado === 'disponible')
        ? `${r.unidades.length} unidades pasaron de cuarentena a disponibles.`
        : undefined,
    error: 'No se registró el resultado',
    invalidar: INVALIDAR,
  });
  const sinFraccionar = d.unidades.length === 0;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-borde px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">
            Donación <span className="cifras">#{d.id_donacion}</span>
          </p>
          <p className="cifras text-xs text-tenue">
            {fechaHora(d.fecha_donacion)} · {d.volumen_ml} ml
          </p>
        </div>
        <span className="cifras rounded-control bg-acento-suave px-2 py-1 text-sm font-semibold text-acento">
          {d.tipo}
        </span>
      </div>
      <ul className="divide-y divide-borde px-4">
        {d.pruebas.map((p) => (
          <Prueba
            key={p.id_prueba}
            prueba={p}
            id_donacion={d.id_donacion}
            ocupado={capturar.isPending}
            alCapturar={(id, resultado) => capturar.mutate({ id, resultado })}
            alReactivo={alReactivo}
          />
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-borde px-4 py-3">
        {sinFraccionar ? (
          d.reactivas === 0 ? (
            <Button tamano="sm" variante="primario" onClick={() => alFraccionar(d)}>
              <Scissors className="size-3.5" aria-hidden />
              Fraccionar
            </Button>
          ) : (
            <span className="text-sm text-peligro">Donación reactiva: no se fracciona</span>
          )
        ) : (
          d.unidades.map((u) => (
            <Badge key={u.id_unidad} tono={TONO_ESTADO_UNIDAD[u.estado]}>
              <span className="cifras">#{u.id_unidad}</span> {u.componente.split(' ').slice(-1)[0]} ·{' '}
              {u.estado}
            </Badge>
          ))
        )}
        {d.pendientes > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-tenue">
            <Clock className="size-3.5" aria-hidden />
            {d.pendientes} pendientes
          </span>
        )}
      </div>
    </Card>
  );
}

function ConfirmarReactivo({ prueba, alCerrar }: { prueba: PruebaElegida | null; alCerrar: () => void }) {
  const capturar = useMutacion({
    fn: (id: number) =>
      api<{ unidades: unknown[] }>(`/laboratorio/pruebas/${id}`, {
        method: 'PATCH',
        json: { resultado: 'reactivo' },
      }),
    exito: 'Resultado reactivo registrado',
    descripcion: (r) =>
      r.unidades.length
        ? `${r.unidades.length} unidades de la donación pasaron a descartadas (baja).`
        : 'La donación no se podrá fraccionar.',
    error: 'No se registró el resultado',
    invalidar: INVALIDAR,
    alTerminar: alCerrar,
  });
  return (
    <Dialogo
      abierto={prueba !== null}
      alCambiar={(a) => !a && alCerrar()}
      titulo={`¿${prueba?.tipo} reactivo?`}
      descripcion={
        <>
          Es definitivo: la base de datos no permite cambiar un resultado ya capturado. Todas las unidades de
          la donación <span className="cifras">#{prueba?.id_donacion}</span> pasarán a{' '}
          <strong>descartadas</strong> con un movimiento de baja.
        </>
      }
      pie={
        <>
          <Button onClick={alCerrar}>Cancelar</Button>
          <Button
            variante="peligro"
            cargando={capturar.isPending}
            onClick={() => prueba && capturar.mutate(prueba.id_prueba)}
          >
            Registrar reactivo
          </Button>
        </>
      }
    />
  );
}

function Fraccionar({ donacion, alCerrar }: { donacion: DonacionLab | null; alCerrar: () => void }) {
  const catalogos = useCatalogos();
  const [elegidos, setElegidos] = useState<number[] | null>(null);
  const componentes = catalogos.data?.componentes ?? [];
  // Por defecto: eritrocitos, plasma y plaquetas (lo habitual de una unidad de sangre total).
  const seleccion =
    elegidos ?? componentes.filter((c) => !c.nombre.startsWith('Crio')).map((c) => c.id_componente);
  const fraccionar = useMutacion({
    fn: (ids: number[]) =>
      api<unknown[]>(`/laboratorio/donaciones/${donacion?.id_donacion}/fraccionar`, {
        method: 'POST',
        json: { componentes: ids },
      }),
    exito: (r) => `${r.length} unidades creadas en cuarentena`,
    descripcion: () => 'Quedarán disponibles cuando las 5 pruebas resulten no reactivas.',
    error: 'No se fraccionó la donación',
    invalidar: INVALIDAR,
    alTerminar: () => {
      setElegidos(null);
      alCerrar();
    },
  });
  const alternar = (id: number) =>
    setElegidos(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);

  return (
    <Dialogo
      abierto={donacion !== null}
      alCambiar={(a) => {
        if (!a) {
          setElegidos(null);
          alCerrar();
        }
      }}
      titulo={`Fraccionar donación #${donacion?.id_donacion ?? ''}`}
      descripcion="La caducidad de cada unidad la calcula la base de datos con la vida útil del componente."
      pie={
        <>
          <Button onClick={alCerrar}>Cancelar</Button>
          <Button
            variante="primario"
            disabled={seleccion.length === 0}
            cargando={fraccionar.isPending}
            onClick={() => fraccionar.mutate(seleccion)}
          >
            Crear {seleccion.length} unidades
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Componentes</legend>
        {componentes.map((c) => (
          <label
            key={c.id_componente}
            className="flex cursor-pointer items-center gap-3 rounded-control border border-borde px-3 py-2.5 has-checked:border-info has-checked:bg-info-suave"
          >
            <input
              type="checkbox"
              className="size-4 accent-(--color-info)"
              checked={seleccion.includes(c.id_componente)}
              onChange={() => alternar(c.id_componente)}
            />
            <span className="flex-1 text-sm font-medium">{c.nombre}</span>
            <span className="cifras text-xs text-tenue">{c.vida_util_dias} días</span>
          </label>
        ))}
      </fieldset>
    </Dialogo>
  );
}

export function Laboratorio() {
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [pagina, setPagina] = useState(1);
  const [reactivo, setReactivo] = useState<PruebaElegida | null>(null);
  const [fraccionar, setFraccionar] = useState<DonacionLab | null>(null);
  const consulta = useQuery({
    queryKey: ['laboratorio', filtro, pagina],
    queryFn: () =>
      api<Pagina<DonacionLab>>(
        `/laboratorio/donaciones?${new URLSearchParams({
          ...(filtro !== 'pendientes' && { filtro }),
          pagina: String(pagina),
          tamano: String(TAMANO),
        })}`,
      ),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Laboratorio"
        descripcion="Captura de tamizaje y fraccionamiento. La liberación o el descarte de unidades los hace la base de datos."
      />
      <Segmentos
        etiqueta="Filtro"
        valor={filtro}
        alCambiar={(v) => {
          setFiltro(v);
          setPagina(1);
        }}
        opciones={[
          { valor: 'pendientes', etiqueta: 'Por atender' },
          { valor: 'tamizaje', etiqueta: 'Tamizaje pendiente' },
          { valor: 'fraccionar', etiqueta: 'Sin fraccionar' },
          { valor: 'todas', etiqueta: 'Todas' },
        ]}
      />
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <ErrorCarga error={consulta.error} />
      ) : consulta.data.datos.length === 0 ? (
        <Card>
          <Vacio>No hay donaciones por atender.</Vacio>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {consulta.data.datos.map((d) => (
              <TarjetaDonacion
                key={d.id_donacion}
                d={d}
                alReactivo={setReactivo}
                alFraccionar={setFraccionar}
              />
            ))}
          </div>
          <Card>
            <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
          </Card>
        </>
      )}
      <ConfirmarReactivo prueba={reactivo} alCerrar={() => setReactivo(null)} />
      <Fraccionar donacion={fraccionar} alCerrar={() => setFraccionar(null)} />
    </div>
  );
}
