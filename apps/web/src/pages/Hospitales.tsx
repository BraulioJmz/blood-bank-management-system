import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { useMutacion } from '../api/hooks';
import type { Hospital } from '../api/tipos';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialogo } from '../components/ui/Dialogo';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga, Vacio } from '../components/ui/Estado';
import { Input } from '../components/ui/Input';
import { Fila, Tabla, Td, Th } from '../components/ui/Tabla';

type Edicion = Hospital | 'nuevo' | null;

function FormHospital({ edicion, alCerrar }: { edicion: Edicion; alCerrar: () => void }) {
  const h = edicion && edicion !== 'nuevo' ? edicion : null;
  const guardar = useMutacion({
    fn: (d: Omit<Hospital, 'id_hospital'>) =>
      h
        ? api<Hospital>(`/hospitales/${h.id_hospital}`, { method: 'PATCH', json: d })
        : api<Hospital>('/hospitales', { method: 'POST', json: d }),
    exito: (r) => (h ? `${r.nombre} actualizado` : `${r.nombre} registrado`),
    error: 'No se guardó el hospital',
    invalidar: [['hospitales'], ['catalogos']],
    alTerminar: alCerrar,
  });
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    guardar.mutate({
      nombre: String(f.get('nombre')).trim(),
      direccion: String(f.get('direccion')).trim(),
      telefono: String(f.get('telefono')).trim(),
    });
  }
  return (
    <Dialogo
      abierto={edicion !== null}
      alCambiar={(a) => !a && alCerrar()}
      titulo={h ? 'Editar hospital' : 'Nuevo hospital'}
      pie={
        <>
          <Button onClick={alCerrar}>Cancelar</Button>
          <Button type="submit" form="form-hospital" variante="primario" cargando={guardar.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="form-hospital"
        key={h?.id_hospital ?? 'nuevo'}
        onSubmit={enviar}
        className="flex flex-col gap-4"
      >
        <Input
          etiqueta="Nombre"
          name="nombre"
          defaultValue={h?.nombre}
          required
          minLength={3}
          maxLength={150}
          autoFocus
        />
        <Input
          etiqueta="Dirección"
          name="direccion"
          defaultValue={h?.direccion}
          required
          minLength={5}
          maxLength={250}
        />
        <Input
          etiqueta="Teléfono"
          name="telefono"
          type="tel"
          defaultValue={h?.telefono}
          required
          pattern="[0-9 +()\-]{7,20}"
          title="7 a 20 dígitos, espacios, +, paréntesis o guiones"
        />
      </form>
    </Dialogo>
  );
}

export function Hospitales() {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const consulta = useQuery({ queryKey: ['hospitales'], queryFn: () => api<Hospital[]>('/hospitales') });
  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Hospitales"
        descripcion="Hospitales que pueden solicitar unidades"
        acciones={
          <Button variante="primario" onClick={() => setEdicion('nuevo')}>
            <Plus className="size-4" aria-hidden />
            Nuevo hospital
          </Button>
        }
      />
      <Card>
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.isError ? (
          <div className="p-4">
            <ErrorCarga error={consulta.error} />
          </div>
        ) : consulta.data.length === 0 ? (
          <Vacio>No hay hospitales registrados.</Vacio>
        ) : (
          <Tabla minimo="44rem">
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Dirección</Th>
                <Th>Teléfono</Th>
                <Th className="text-right">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((h) => (
                <Fila key={h.id_hospital}>
                  <Td className="max-w-64 font-medium">{h.nombre}</Td>
                  <Td className="max-w-80 text-tenue">{h.direccion}</Td>
                  <Td className="cifras whitespace-nowrap">{h.telefono}</Td>
                  <Td className="text-right">
                    <Button
                      tamano="icono"
                      variante="fantasma"
                      onClick={() => setEdicion(h)}
                      aria-label={`Editar ${h.nombre}`}
                      title="Editar"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
      <FormHospital edicion={edicion} alCerrar={() => setEdicion(null)} />
    </div>
  );
}
