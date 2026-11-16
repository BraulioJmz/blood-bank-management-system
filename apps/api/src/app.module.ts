import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [SaludController],
})
export class AppModule {}
