import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { DonantesModule } from './donantes/donantes.module';
import { InventarioModule } from './inventario/inventario.module';
import { LaboratorioModule } from './laboratorio/laboratorio.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [
    DbModule,
    AuthModule,
    DonantesModule,
    LaboratorioModule,
    InventarioModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
