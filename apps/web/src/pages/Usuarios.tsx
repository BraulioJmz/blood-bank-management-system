import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api/cliente';
import { useCatalogos, useMutacion } from '../api/hooks';
import type { Rol, UsuarioAdmin } from '../api/tipos';
import { useSesion } from '../auth/contexto';
import { NOMBRE_ROL } from '../layout/navegacion';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Campo';
import { Card } from '../components/ui/Card';
import { Dialogo } from '../components/ui/Dialogo';
import { Encabezado } from '../components/ui/Encabezado';
import { Cargando, ErrorCarga } from '../components/ui/Estado';
import { Input } from '../components/ui/Input';
import { Fila, Tabla, Td, Th } from '../components/ui/Tabla';

type Edicion = UsuarioAdmin | 'nuevo' | null;
const ROLES = Object.keys(NOMBRE_ROL) as Rol[];

function FormUsuario({ edicion, alCerrar }: { edicion: Edicion; alCerrar: () => void }) {
  const { usuario: yo } = useSesion();
  const catalogos = useCatalogos();
  const u = edicion && edicion !== 'nuevo' ? edicion : null;
  const [rol, setRol] = useState<Rol | ''>(u?.rol ?? '');
  const rolActual = rol || u?.rol || '';
  const guardar = useMutacion({
    fn: (d: Record<string, unknown>) =>
      u
        ? api(`/admin/usuarios/${u.id_usuario}`, { method: 'PATCH', json: d })
        : api<{ username: string }>('/admin/usuarios', { method: 'POST', json: d }),
    exito: () => (u ? `Usuario ${u.username} actualizado` : 'Usuario creado'),
    error: 'No se guardó el usuario',
    invalidar: [['usuarios']],
    alTerminar: () => {
      setRol('');
      alCerrar();
    },
  });
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    const d: Record<string, unknown> = {
      nombre: String(f.get('nombre')).trim(),
      rol: rolActual,
      // La BD exige hospital solo para el rol hospital (BS016); aquí se manda null en los demás.
      id_hospital: rolActual === 'hospital' ? Number(f.get('id_hospital')) : null,
    };
    if (!u) d.username = String(f.get('username')).trim().toLowerCase();
    if (password) d.password = password;
    // Un checkbox deshabilitado no viaja en el FormData: para uno mismo no se manda `activo`
    // (si no, se leería como desmarcado y el admin se desactivaría solo).
    if (u && u.id_usuario !== yo?.idUsuario) d.activo = f.get('activo') === 'on';
    guardar.mutate(d);
  }
  const cerrar = () => {
    setRol('');
    alCerrar();
  };
  return (
    <Dialogo
      abierto={edicion !== null}
      alCambiar={(a) => !a && cerrar()}
      titulo={u ? `Editar ${u.username}` : 'Nuevo usuario'}
      descripcion="La contraseña se guarda como hash argon2id; nadie puede leerla, ni el administrador."
      pie={
        <>
          <Button onClick={cerrar}>Cancelar</Button>
          <Button type="submit" form="form-usuario" variante="primario" cargando={guardar.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="form-usuario"
        key={u?.id_usuario ?? 'nuevo'}
        onSubmit={enviar}
        className="grid gap-4 sm:grid-cols-2"
      >
        {!u && (
          <Input
            etiqueta="Usuario"
            name="username"
            required
            pattern="[a-z0-9._]{3,50}"
            title="3 a 50 minúsculas, dígitos, punto o guion bajo"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        )}
        <div className={u ? 'sm:col-span-2' : ''}>
          <Input
            etiqueta="Nombre"
            name="nombre"
            defaultValue={u?.nombre}
            required
            minLength={3}
            maxLength={150}
          />
        </div>
        <Select
          etiqueta="Rol"
          name="rol"
          required
          value={rolActual}
          onChange={(e) => setRol(e.target.value as Rol)}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {NOMBRE_ROL[r]}
            </option>
          ))}
        </Select>
        {rolActual === 'hospital' ? (
          <Select etiqueta="Hospital" name="id_hospital" required defaultValue={u?.id_hospital ?? ''}>
            <option value="" disabled>
              Selecciona…
            </option>
            {catalogos.data?.hospitales.map((h) => (
              <option key={h.id_hospital} value={h.id_hospital}>
                {h.nombre}
              </option>
            ))}
          </Select>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:col-span-2">
          <Input
            etiqueta={u ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            name="password"
            type="password"
            autoComplete="new-password"
            required={!u}
            pattern="(?=.*[A-Za-z])(?=.*\d).{8,100}"
            title="8 o más caracteres con letras y números"
          />
        </div>
        {u && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={u.activo}
              disabled={u.id_usuario === yo?.idUsuario}
              className="size-4 accent-(--color-info)"
            />
            Activo (puede iniciar sesión)
            {u.id_usuario === yo?.idUsuario && <span className="text-tenue">· no puedes desactivarte</span>}
          </label>
        )}
      </form>
    </Dialogo>
  );
}

export function Usuarios() {
  const [edicion, setEdicion] = useState<Edicion>(null);
  const consulta = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<UsuarioAdmin[]>('/admin/usuarios'),
  });
  return (
    <div className="flex flex-col gap-5">
      <Encabezado
        titulo="Usuarios"
        descripcion="Cuentas de la aplicación. Cada rol se traduce en un rol de PostgreSQL con privilegios mínimos."
        acciones={
          <Button variante="primario" onClick={() => setEdicion('nuevo')}>
            <Plus className="size-4" aria-hidden />
            Nuevo usuario
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
        ) : (
          <Tabla minimo="44rem">
            <thead>
              <tr>
                <Th>Usuario</Th>
                <Th>Nombre</Th>
                <Th>Rol</Th>
                <Th>Hospital</Th>
                <Th>Estado</Th>
                <Th className="text-right">
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((u) => (
                <Fila key={u.id_usuario} className={u.activo ? '' : 'text-tenue'}>
                  <Td className="font-mono text-xs">{u.username}</Td>
                  <Td className="max-w-60 truncate font-medium" title={u.nombre}>
                    {u.nombre}
                  </Td>
                  <Td>{NOMBRE_ROL[u.rol]}</Td>
                  <Td className="max-w-56 truncate text-tenue" title={u.hospital ?? undefined}>
                    {u.hospital ?? '—'}
                  </Td>
                  <Td>
                    <Badge tono={u.activo ? 'ok' : 'neutro'}>{u.activo ? 'activo' : 'inactivo'}</Badge>
                  </Td>
                  <Td className="text-right">
                    <Button
                      tamano="icono"
                      variante="fantasma"
                      onClick={() => setEdicion(u)}
                      aria-label={`Editar ${u.username}`}
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
      <FormUsuario edicion={edicion} alCerrar={() => setEdicion(null)} />
    </div>
  );
}
