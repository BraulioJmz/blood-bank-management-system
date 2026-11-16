import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [DbModule],
  controllers: [SaludController],
})
export class AppModule {}
