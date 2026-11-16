import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
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
    AdminModule,
    DashboardModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
