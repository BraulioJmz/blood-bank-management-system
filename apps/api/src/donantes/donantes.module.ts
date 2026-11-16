import { Module } from '@nestjs/common';
import { DonantesController } from './donantes.controller';

@Module({ controllers: [DonantesController] })
export class DonantesModule {}
