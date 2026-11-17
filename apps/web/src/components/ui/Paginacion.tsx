import { ChevronLeft, ChevronRight } from 'lucide-react';
import { numero } from '../../lib/formato';
import { Button } from './Button';

export function Paginacion({
  pagina,
  tamano,
  total,
  alCambiar,
}: {
  pagina: number;
  tamano: number;
  total: number;
  alCambiar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-4 py-3 text-sm sm:px-5">
      <p className="cifras text-tenue">
        {numero(desde)}–{numero(hasta)} de {numero(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button
          tamano="icono"
          variante="fantasma"
          onClick={() => alCambiar(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="cifras px-2 text-tenue">
          {numero(pagina)} / {numero(paginas)}
        </span>
        <Button
          tamano="icono"
          variante="fantasma"
          onClick={() => alCambiar(pagina + 1)}
          disabled={pagina >= paginas}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
