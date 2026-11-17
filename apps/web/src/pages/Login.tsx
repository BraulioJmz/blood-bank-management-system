import { Droplet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useSesion } from '../auth/sesion';

export function Login() {
  const { usuario, entrar } = useSesion();
  const navegar = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/';
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={desde} replace />;

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setEnviando(true);
    setError(undefined);
    try {
      await entrar(String(datos.get('username')).trim(), String(datos.get('password')));
      navegar(desde, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-tarjeta bg-acento-suave text-acento">
            <Droplet className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Banco de Sangre</h1>
            <p className="text-sm text-tenue">Inicia sesión con tu usuario institucional</p>
          </div>
        </div>
        <form onSubmit={enviar} className="flex flex-col gap-4 rounded-tarjeta bg-superficie p-5 shadow-tarjeta sm:p-6" noValidate>
          <Input etiqueta="Usuario" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
          <Input etiqueta="Contraseña" name="password" type="password" autoComplete="current-password" required />
          {error && (
            <p className="rounded-control bg-peligro-suave px-3 py-2 text-sm text-peligro" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variante="primario" cargando={enviando} className="mt-1 w-full">
            Entrar
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-tenue">Solo datos sintéticos · Proyecto ABD UDG/CUCEI</p>
      </div>
    </main>
  );
}
