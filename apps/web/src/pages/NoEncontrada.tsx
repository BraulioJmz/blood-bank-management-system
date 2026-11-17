import { Link } from 'react-router';
import { Card } from '../components/ui/Card';

export function NoEncontrada() {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="cifras text-sm text-tenue">404</p>
      <h1 className="font-semibold">Página no encontrada</h1>
      <Link to="/" className="text-sm text-info hover:underline">
        Volver al panel
      </Link>
    </Card>
  );
}
