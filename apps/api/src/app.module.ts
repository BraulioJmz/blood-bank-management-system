import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { DonantesModule } from './donantes/donantes.module';
import { HospitalesModule } from './hospitales/hospitales.module';
import { InventarioModule } from './inventario/inventario.module';
import { LaboratorioModule } from './laboratorio/laboratorio.module';
import { SaludController } from './salud.controller';
import { SolicitudesModule } from './solicitudes/solicitudes.module';
import { TrazabilidadModule } from './trazabilidad/trazabilidad.module';

@Module({
  imports: [
    DbModule,
    AuthModule,
    DonantesModule,
    LaboratorioModule,
    InventarioModule,
    HospitalesModule,
    SolicitudesModule,
    TrazabilidadModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
