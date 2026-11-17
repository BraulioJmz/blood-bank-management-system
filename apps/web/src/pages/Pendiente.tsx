import { Construction } from 'lucide-react';
import { Card } from '../components/ui/Card';

/** Marcador para pantallas de las siguientes features (web-operacion, web-solicitudes…). */
export function Pendiente({ titulo }: { titulo: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Construction className="size-5 text-tenue" aria-hidden />
      <h1 className="font-semibold">{titulo}</h1>
      <p className="text-sm text-tenue">Esta pantalla se construye en la siguiente entrega.</p>
    </Card>
  );
}
