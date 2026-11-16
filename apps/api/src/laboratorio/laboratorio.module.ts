import { Module } from '@nestjs/common';
import { LaboratorioController } from './laboratorio.controller';

@Module({ controllers: [LaboratorioController] })
export class LaboratorioModule {}
