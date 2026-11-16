import { Module } from '@nestjs/common';
import { TrazabilidadController } from './trazabilidad.controller';

@Module({ controllers: [TrazabilidadController] })
export class TrazabilidadModule {}
