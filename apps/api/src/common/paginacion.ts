import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  tamano = 25;

  get offset() {
    return (this.pagina - 1) * this.tamano;
  }
}

/** Filas con `total` (count(*) OVER ()) → { datos, total, pagina, tamano }. */
export function paginado<T extends { total?: unknown }>(
  filas: T[],
  p: PaginacionDto,
) {
  const total = filas.length ? Number(filas[0].total) : 0;
  const datos = filas.map(({ total: _t, ...resto }) => {
    void _t;
    return resto;
  });
  return { datos, total, pagina: p.pagina, tamano: p.tamano };
}

/** Fila genérica de pg: obliga a no asumir tipos de columnas sin declararlos. */
export type Fila = Record<string, unknown>;
