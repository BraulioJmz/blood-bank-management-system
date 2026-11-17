import { useQuery } from '@tanstack/react-query';
import { History, PackageCheck, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { useCatalogos, useMutacion } from '../api/hooks';
import type { Movimiento, Pagina, UnidadInventario } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { AreaTexto, Select } from '../components/ui/Campo';
import { Card } from '../components/ui/Card';
import { Dialogo } from '../components/ui/Dialogo';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { Paginacion } from '../components/ui/Paginacion';
import { Segmentos } from '../components/ui/Segmentos';
import { Fila, Tabla, Td, Th } from '../components/ui/Tabla';
import { TONO_ESTADO_UNIDAD, TONO_SEMAFORO } from '../components/ui/tonos';
import { claseControl } from '../components/ui/estilos';
import { cn } from '../lib/cn';
import { dias, fecha, fechaHora } from '../lib/formato';

const TAMANO = 25;
const ESTADOS = ['cuarentena', 'disponible', 'asignada', 'entregada', 'caducada', 'descartada'] as const;
const SE_PUEDE_DAR_DE_BAJA = ['cuarentena', 'disponible', 'caducada'];
const INVALIDAR = [['inventario'], ['dashboard'], ['solicitudes']];
const TEXTO_SEMAFORO = { rojo: 'Crítica', amarillo: 'Por caducar', verde: 'Vigente' } as const;

type Semaforo = 'todos' | 'rojo' | 'amarillo' | 'verde';

function DarDeBaja({ unidad, alCerrar }: { unidad: UnidadInventario | null; alCerrar: () => void }) {
  const [error, setError] = useState<string>();
  const baja = useMutacion({
    fn: (motivo: string) =>
      api(`/inventario/unidades/${unidad?.id_unidad}/baja`, { method: 'POST', json: { motivo } }),
    exito: () => `Unidad #${unidad?.id_unidad} dada de baja`,
    descripcion: () => 'Quedó como descartada y con un movimiento de baja en su historial.',
    error: 'No se dio de baja',
    invalidar: INVALIDAR,
    alTerminar: alCerrar,
  });
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get('motivo')).trim();
    if (motivo.length < 5) return setError('Describe el motivo (mínimo 5 caracteres).');
    setError(undefined);
    baja.mutate(motivo);
  }
  return (
    <Dialogo
      abierto={unidad !== null}
      alCambiar={(a) => {
        if (!a) {
          setError(undefined);
          alCerrar();
        }
      }}
      titulo={`Dar de baja la unidad #${unidad?.id_unidad ?? ''}`}
      descripcion={
        unidad && (
          <>
            {unidad.tipo} · {unidad.componente} · {unidad.estado}. No se puede deshacer: la unidad pasa a{' '}
            <strong>descartada</strong>.
          </>
        )
      }
      pie={
        <>
          <Button onClick={alCerrar}>Cancelar</Button>
          <Button type="submit" form="form-baja" variante="peligro" cargando={baja.isPending}>
            Dar de baja
          </Button>
        </>
      }
    >
      <form id="form-baja" onSubmit={enviar} noValidate>
        <AreaTexto
          etiqueta="Motivo"
          name="motivo"
          maxLength={250}
          required
          error={error}
          placeholder="Ej. Bolsa con fuga detectada en inspección visual"
          autoFocus
        />
      </form>
    </Dialogo>
  );
}

function Entregar({ unidad, alCerrar }: { unidad: UnidadInventario | null; alCerrar: () => void }) {
  const entregar = useMutacion({
    fn: () => api(`/inventario/unidades/${unidad?.id_unidad}/entregar`, { method: 'POST' }),
    exito: () => `Unidad #${unidad?.id_unidad} entregada`,
    error: 'No se registró la entrega',
    invalidar: INVALIDAR,
    alTerminar: alCerrar,
  });
  return (
    <Dialogo
      abierto={unidad !== null}
      alCambiar={(a) => !a && alCerrar()}
      titulo={`¿Entregar la unidad #${unidad?.id_unidad ?? ''}?`}
      descripcion="Confirma que la unidad salió físicamente hacia el hospital. Queda registrado en su historial."
      pie={
        <>
          <Button onClick={alCerrar}>Cancelar</Button>
          <Button
            variante="primario"
            cargando={entregar.isPending}
            onClick={() => entregar.mutate(undefined)}
          >
            Registrar entrega
          </Button>
        </>
      }
    />
  );
}

const TONO_MOVIMIENTO = { entrada: 'ok', salida: 'info', baja: 'peligro', cambio_estado: 'neutro' } as const;

function Movimientos({ unidad, alCerrar }: { unidad: UnidadInventario | null; alCerrar: () => void }) {
  const consulta = useQuery({
    queryKey: ['inventario', 'movimientos', unidad?.id_unidad],
    queryFn: () => api<Movimiento[]>(`/inventario/unidades/${unidad?.id_unidad}/movimientos`),
    enabled: unidad !== null,
  });
  return (
    <Dialogo
      abierto={unidad !== null}
      alCambiar={(a) => !a && alCerrar()}
      titulo={`Historial de la unidad #${unidad?.id_unidad ?? ''}`}
      descripcion={unidad && `${unidad.tipo} · ${unidad.componente} · donación #${unidad.id_donacion}`}
      ancho="lg"
    >
      {consulta.isError ? (
        <ErrorCarga error={consulta.error} />
      ) : !consulta.data ? (
        <Cargando />
      ) : consulta.data.length === 0 ? (
        <Vacio>Sin movimientos.</Vacio>
      ) : (
        <ol className="relative ml-2 border-l border-borde">
          {consulta.data.map((m) => (
            <li key={m.id_movimiento} className="ml-4 pb-4 last:pb-0">
              <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-borde-fuerte" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tono={TONO_MOVIMIENTO[m.tipo_movimiento]}>{m.tipo_movimiento.replace('_', ' ')}</Badge>
                <span className="cifras text-xs text-tenue">{fechaHora(m.fecha_movimiento)}</span>
              </div>
              <p className="mt-1 text-sm">{m.motivo ?? '—'}</p>
              <p className="text-xs text-tenue">{m.usuario}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialogo>
  );
}

export function Inventario() {
  const { usuario } = useSesion();
  const catalogos = useCatalogos();
  const esInventario = usuario?.rol === 'inventario';
  const veHistorial = usuario?.rol === 'inventario' || usuario?.rol === 'admin';
  const [estado, setEstado] = useState('vigentes');
  const [tipo, setTipo] = useState('');
  const [componente, setComponente] = useState('');
  const [semaforo, setSemaforo] = useState<Semaforo>('todos');
  const [idUnidad, setIdUnidad] = useState('');
  const [pagina, setPagina] = useState(1);
  const [baja, setBaja] = useState<UnidadInventario | null>(null);
  const [entrega, setEntrega] = useState<UnidadInventario | null>(null);
  const [historial, setHistorial] = useState<UnidadInventario | null>(null);

  const params = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO) });
  if (estado === 'vigentes') params.set('vista', 'vigentes');
  else if (estado) params.set('estado', estado);
  if (tipo) params.set('id_tipo_sanguineo', tipo);
  if (componente) params.set('id_componente', componente);
  if (semaforo !== 'todos') params.set('semaforo', semaforo);
  if (/^\d+$/.test(idUnidad.trim())) params.set('id_unidad', idUnidad.trim());

  const consulta = useQuery({
    queryKey: ['inventario', 'unidades', params.toString()],
    queryFn: () => api<Pagina<UnidadInventario>>(`/inventario/unidades?${params}`),
    placeholderData: (prev) => prev,
  });

  const filtrar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Inventario"
        descripcion="Unidades con semáforo de caducidad relativo al umbral de cada componente"
      />

      <Card>
        <div className="grid gap-3 border-b border-borde p-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-[repeat(3,minmax(0,12rem))_minmax(0,9rem)_1fr]">
          <Select etiqueta="Estado" value={estado} onChange={(e) => filtrar(setEstado)(e.target.value)}>
            <option value="vigentes">Vigentes</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e[0].toUpperCase() + e.slice(1)}
              </option>
            ))}
            <option value="">Todos</option>
          </Select>
          <Select etiqueta="Tipo" value={tipo} onChange={(e) => filtrar(setTipo)(e.target.value)}>
            <option value="">Todos</option>
            {catalogos.data?.tipos.map((t) => (
              <option key={t.id_tipo_sanguineo} value={t.id_tipo_sanguineo}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
          <Select
            etiqueta="Componente"
            value={componente}
            onChange={(e) => filtrar(setComponente)(e.target.value)}
          >
            <option value="">Todos</option>
            {catalogos.data?.componentes.map((c) => (
              <option key={c.id_componente} value={c.id_componente}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="id-unidad" className="text-sm font-medium">
              Unidad #
            </label>
            <input
              id="id-unidad"
              inputMode="numeric"
              value={idUnidad}
              onChange={(e) => filtrar(setIdUnidad)(e.target.value.replace(/\D/g, ''))}
              placeholder="Número"
              className={cn(claseControl, 'cifras h-10')}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
            <span className="text-sm font-medium">Semáforo</span>
            <Segmentos
              etiqueta="Semáforo"
              valor={semaforo}
              alCambiar={filtrar(setSemaforo)}
              opciones={[
                { valor: 'todos', etiqueta: 'Todos' },
                { valor: 'rojo', etiqueta: 'Crítica' },
                { valor: 'amarillo', etiqueta: 'Por caducar' },
                { valor: 'verde', etiqueta: 'Vigente' },
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
          <Vacio>Ninguna unidad coincide con los filtros.</Vacio>
        ) : (
          <div className={cn(consulta.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <Tabla minimo="58rem">
              <thead>
                <tr>
                  <Th numerico>Unidad</Th>
                  <Th>Tipo</Th>
                  <Th>Componente</Th>
                  <Th>Estado</Th>
                  <Th>Caduca</Th>
                  <Th>Semáforo</Th>
                  <Th numerico>Donación</Th>
                  {(esInventario || veHistorial) && <Th className="text-right">Acciones</Th>}
                </tr>
              </thead>
              <tbody>
                {consulta.data.datos.map((u) => (
                  <Fila key={u.id_unidad}>
                    <Td numerico className="font-medium">
                      {u.id_unidad}
                    </Td>
                    <Td className="cifras font-semibold">{u.tipo}</Td>
                    <Td className="max-w-56 truncate" title={u.componente}>
                      {u.componente}
                    </Td>
                    <Td>
                      <Badge tono={TONO_ESTADO_UNIDAD[u.estado]}>{u.estado}</Badge>
                    </Td>
                    <Td className="cifras whitespace-nowrap">
                      {fecha(u.fecha_caducidad)}
                      {u.semaforo && (
                        <span className="ml-1.5 text-xs text-tenue">({dias(Number(u.dias_restantes))})</span>
                      )}
                    </Td>
                    <Td>
                      {u.semaforo ? (
                        <Badge tono={TONO_SEMAFORO[u.semaforo]}>
                          <span className={cn('size-1.5 rounded-full bg-current')} aria-hidden />
                          {TEXTO_SEMAFORO[u.semaforo]}
                        </Badge>
                      ) : (
                        <span className="text-tenue">—</span>
                      )}
                    </Td>
                    <Td numerico className="text-tenue">
                      {u.id_donacion}
                    </Td>
                    {(esInventario || veHistorial) && (
                      <Td>
                        <div className="flex justify-end gap-1">
                          {esInventario && u.estado === 'asignada' && (
                            <Button tamano="sm" onClick={() => setEntrega(u)}>
                              <PackageCheck className="size-3.5" aria-hidden />
                              Entregar
                            </Button>
                          )}
                          {esInventario && SE_PUEDE_DAR_DE_BAJA.includes(u.estado) && (
                            <Button
                              tamano="icono"
                              variante="fantasma"
                              className="text-peligro"
                              onClick={() => setBaja(u)}
                              aria-label={`Dar de baja la unidad ${u.id_unidad}`}
                              title="Dar de baja"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                          {veHistorial && (
                            <Button
                              tamano="icono"
                              variante="fantasma"
                              onClick={() => setHistorial(u)}
                              aria-label={`Historial de la unidad ${u.id_unidad}`}
                              title="Historial"
                            >
                              <History className="size-4" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </Td>
                    )}
                  </Fila>
                ))}
              </tbody>
            </Tabla>
            <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
          </div>
        )}
      </Card>

      <DarDeBaja unidad={baja} alCerrar={() => setBaja(null)} />
      <Entregar unidad={entrega} alCerrar={() => setEntrega(null)} />
      <Movimientos unidad={historial} alCerrar={() => setHistorial(null)} />
    </div>
  );
}
