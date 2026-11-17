import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../common/paginacion';

export class CrearDonanteDto {
  @IsString()
  @Length(3, 150)
  nombre!: string;

  @IsISO8601(
    { strict: true },
    { message: 'fecha_nacimiento debe ser AAAA-MM-DD' },
  )
  fecha_nacimiento!: string;

  @IsIn(['M', 'F'])
  sexo!: 'M' | 'F';

  @IsInt()
  id_tipo_sanguineo!: number;
}

export class ActualizarDonanteDto {
  @IsOptional() @IsString() @Length(3, 150) nombre?: string;
  @IsOptional() @IsISO8601({ strict: true }) fecha_nacimiento?: string;
  @IsOptional() @IsIn(['M', 'F']) sexo?: 'M' | 'F';
  @IsOptional() @IsInt() id_tipo_sanguineo?: number;
}

export class BuscarDonantesDto extends PaginacionDto {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
}

export class CrearDonacionDto {
  @IsInt() id_donante!: number;

  @IsIn(['altruista', 'familiar', 'autologa'])
  tipo_donacion!: string;

  @Type(() => Number)
  @IsInt()
  @Min(200)
  @Max(550)
  volumen_ml!: number;
}

export class ListarDonacionesDto extends PaginacionDto {
  @IsOptional() @IsIn(['tamizaje', 'todas']) estado?: 'tamizaje' | 'todas';
  @IsOptional() @Type(() => Number) @IsInt() id_donante?: number;
}
