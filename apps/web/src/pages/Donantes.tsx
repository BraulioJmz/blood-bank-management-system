import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { useCatalogos, useMutacion } from '../api/hooks';
import type { Donacion, Donante, DonanteDetalle, Pagina } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { ResumenTamizaje } from '../components/dominio/Tamizaje';
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
import { fecha, fechaHora, numero } from '../lib/formato';
import { useDiferido } from '../lib/useDiferido';

const TAMANO = 25;

function NuevoDonante({ abierto, alCambiar }: { abierto: boolean; alCambiar: (a: boolean) => void }) {
  const catalogos = useCatalogos();
  const crear = useMutacion({
    fn: (d: Record<string, unknown>) => api<{ id_donante: number }>('/donantes', { method: 'POST', json: d }),
    exito: (r) => `Donante #${r.id_donante} registrado`,
    error: 'No se registró el donante',
    invalidar: [['donantes']],
    alTerminar: () => alCambiar(false),
  });

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    crear.mutate({
      nombre: String(f.get('nombre')).trim(),
      fecha_nacimiento: String(f.get('fecha_nacimiento')),
      sexo: String(f.get('sexo')),
      id_tipo_sanguineo: Number(f.get('id_tipo_sanguineo')),
    });
  }

  return (
    <Dialogo
      abierto={abierto}
      alCambiar={alCambiar}
      titulo="Nuevo donante"
      descripcion="La edad mínima para donar la valida la base de datos al registrar la donación."
      pie={
        <>
          <Button onClick={() => alCambiar(false)}>Cancelar</Button>
          <Button type="submit" form="form-donante" variante="primario" cargando={crear.isPending}>
            Registrar
          </Button>
        </>
      }
    >
      <form id="form-donante" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input etiqueta="Nombre completo" name="nombre" required minLength={3} maxLength={150} autoFocus />
        </div>
        <Input etiqueta="Fecha de nacimiento" name="fecha_nacimiento" type="date" required />
        <Select etiqueta="Sexo" name="sexo" required defaultValue="">
          <option value="" disabled>
            Selecciona…
          </option>
          <option value="F">Femenino</option>
          <option value="M">Masculino</option>
        </Select>
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
      </form>
    </Dialogo>
  );
}

function DetalleDonante({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const { usuario } = useSesion();
  const esRecepcion = usuario?.rol === 'recepcion';
  const detalle = useQuery({
    queryKey: ['donantes', id],
    queryFn: () => api<DonanteDetalle>(`/donantes/${id}`),
    enabled: id !== null,
  });
  const registrar = useMutacion({
    fn: (d: { tipo_donacion: string; volumen_ml: number }) =>
      api<{ id_donacion: number }>('/donaciones', { method: 'POST', json: { id_donante: id, ...d } }),
    exito: (r) => `Donación #${r.id_donacion} registrada`,
    descripcion: () => 'Se crearon las 5 pruebas de tamizaje en estado pendiente.',
    error: 'No se registró la donación',
    invalidar: [['donantes'], ['donaciones'], ['laboratorio']],
  });

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    registrar.mutate({
      tipo_donacion: String(f.get('tipo_donacion')),
      volumen_ml: Number(f.get('volumen_ml')),
    });
  }

  const d = detalle.data;
  return (
    <Dialogo
      abierto={id !== null}
      alCambiar={(a) => !a && alCerrar()}
      titulo={d ? d.nombre : 'Donante'}
      descripcion={
        d && `#${d.id_donante} · ${d.tipo} · ${d.edad} años · ${d.sexo === 'F' ? 'Femenino' : 'Masculino'}`
      }
      ancho="lg"
    >
      {detalle.isError ? (
        <ErrorCarga error={detalle.error} />
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="flex flex-col gap-5">
          {esRecepcion && (
            <form
              onSubmit={enviar}
              className="grid items-end gap-3 rounded-control bg-hundido p-3 sm:grid-cols-[1fr_9rem_auto]"
            >
              <Select etiqueta="Tipo de donación" name="tipo_donacion" defaultValue="altruista">
                <option value="altruista">Altruista</option>
                <option value="familiar">Familiar</option>
                <option value="autologa">Autóloga</option>
              </Select>
              <Input
                etiqueta="Volumen (ml)"
                name="volumen_ml"
                type="number"
                min={200}
                max={550}
                defaultValue={450}
                required
              />
              <Button type="submit" variante="primario" cargando={registrar.isPending}>
                Registrar donación
              </Button>
            </form>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Donaciones ({d.donaciones.length})</h3>
            {d.donaciones.length === 0 ? (
              <Vacio>Sin donaciones registradas.</Vacio>
            ) : (
              <ul className="divide-y divide-borde rounded-control border border-borde">
                {d.donaciones.map((x) => (
                  <li key={x.id_donacion} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="cifras w-16 text-tenue">#{x.id_donacion}</span>
                    <span className="flex-1">{fechaHora(x.fecha_donacion)}</span>
                    <Badge>{x.tipo_donacion}</Badge>
                    <span className="cifras w-16 text-right">{x.volumen_ml} ml</span>
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

function ListaDonantes({ alAbrir }: { alAbrir: (id: number) => void }) {
  const [texto, setTexto] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = useDiferido(texto.trim());
  const consulta = useQuery({
    queryKey: ['donantes', 'lista', q, pagina],
    queryFn: () =>
      api<Pagina<Donante>>(
        `/donantes?${new URLSearchParams({ ...(q && { q }), pagina: String(pagina), tamano: String(TAMANO) })}`,
      ),
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <div className="border-b border-borde p-3 sm:px-5">
        <label className="relative block max-w-sm">
          <span className="sr-only">Buscar donante</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tenue"
            aria-hidden
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por nombre o número"
            className="h-10 w-full rounded-control border border-borde-fuerte bg-superficie pr-3 pl-9 text-sm focus:border-info focus:ring-3 focus:ring-info/15 focus:outline-none"
          />
        </label>
      </div>
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <div className="p-4">
          <ErrorCarga error={consulta.error} />
        </div>
      ) : consulta.data.datos.length === 0 ? (
        <Vacio>{q ? `Ningún donante coincide con “${q}”.` : 'No hay donantes registrados.'}</Vacio>
      ) : (
        <>
          <Tabla minimo="40rem">
            <thead>
              <tr>
                <Th numerico>#</Th>
                <Th>Nombre</Th>
                <Th>Tipo</Th>
                <Th numerico>Edad</Th>
                <Th>Sexo</Th>
                <Th>Última donación</Th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.datos.map((d) => (
                <Fila
                  key={d.id_donante}
                  onClick={() => alAbrir(d.id_donante)}
                  className="cursor-pointer [@media(hover:hover)]:hover:bg-hundido"
                >
                  <Td numerico className="text-tenue">
                    {d.id_donante}
                  </Td>
                  <Td className="max-w-72">
                    <button
                      type="button"
                      className="max-w-full truncate text-left font-medium hover:underline"
                      title={d.nombre}
                      onClick={(e) => {
                        e.stopPropagation();
                        alAbrir(d.id_donante);
                      }}
                    >
                      {d.nombre}
                    </button>
                  </Td>
                  <Td className="cifras font-medium">{d.tipo}</Td>
                  <Td numerico>{d.edad}</Td>
                  <Td>{d.sexo === 'F' ? 'F' : 'M'}</Td>
                  <Td className="text-tenue">{d.ultima_donacion ? fecha(d.ultima_donacion) : '—'}</Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
          <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
        </>
      )}
    </Card>
  );
}

function ListaDonaciones() {
  const [estado, setEstado] = useState<'todas' | 'tamizaje'>('tamizaje');
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    queryKey: ['donaciones', estado, pagina],
    queryFn: () => api<Pagina<Donacion>>(`/donaciones?estado=${estado}&pagina=${pagina}&tamano=${TAMANO}`),
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <div className="border-b border-borde p-3 sm:px-5">
        <Segmentos
          etiqueta="Filtrar donaciones"
          valor={estado}
          alCambiar={(v) => {
            setEstado(v);
            setPagina(1);
          }}
          opciones={[
            { valor: 'tamizaje', etiqueta: 'En tamizaje' },
            { valor: 'todas', etiqueta: 'Todas' },
          ]}
        />
      </div>
      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <div className="p-4">
          <ErrorCarga error={consulta.error} />
        </div>
      ) : consulta.data.datos.length === 0 ? (
        <Vacio>No hay donaciones con pruebas pendientes.</Vacio>
      ) : (
        <>
          <Tabla minimo="56rem">
            <thead>
              <tr>
                <Th numerico>#</Th>
                <Th>Fecha</Th>
                <Th>Donante</Th>
                <Th>Tipo</Th>
                <Th>Tamizaje</Th>
                <Th numerico>Volumen</Th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.datos.map((d) => (
                <Fila key={d.id_donacion}>
                  <Td numerico className="text-tenue">
                    {d.id_donacion}
                  </Td>
                  <Td className="whitespace-nowrap">{fechaHora(d.fecha_donacion)}</Td>
                  <Td className="max-w-60 truncate" title={d.donante}>
                    {d.donante}
                  </Td>
                  <Td className="cifras font-medium">{d.tipo}</Td>
                  <Td>
                    <ResumenTamizaje pruebas={d.pruebas} />
                  </Td>
                  <Td numerico>{numero(d.volumen_ml)} ml</Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
          <Paginacion pagina={pagina} tamano={TAMANO} total={consulta.data.total} alCambiar={setPagina} />
        </>
      )}
    </Card>
  );
}

export function Donantes() {
  const { usuario } = useSesion();
  const [vista, setVista] = useState<'donantes' | 'donaciones'>('donantes');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Donantes y donaciones"
        descripcion="Registro de donantes, donaciones y avance del tamizaje"
        acciones={
          usuario?.rol === 'recepcion' && (
            <Button variante="primario" onClick={() => setNuevo(true)}>
              <Plus className="size-4" aria-hidden />
              Nuevo donante
            </Button>
          )
        }
      />
      <Segmentos
        etiqueta="Vista"
        valor={vista}
        alCambiar={setVista}
        opciones={[
          { valor: 'donantes', etiqueta: 'Donantes' },
          { valor: 'donaciones', etiqueta: 'Donaciones' },
        ]}
      />
      {vista === 'donantes' ? <ListaDonantes alAbrir={setAbierto} /> : <ListaDonaciones />}
      <NuevoDonante abierto={nuevo} alCambiar={setNuevo} />
      <DetalleDonante id={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}
