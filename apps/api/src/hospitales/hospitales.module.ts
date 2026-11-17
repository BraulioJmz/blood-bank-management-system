import { Module } from '@nestjs/common';
import { HospitalesController } from './hospitales.controller';

@Module({ controllers: [HospitalesController] })
export class HospitalesModule {}
