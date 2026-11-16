import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

export function configurarApp(app: import('@nestjs/common').INestApplication) {
  app.setGlobalPrefix('api');
  // Valida y transforma los DTO; rechaza propiedades no declaradas.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: config.corsOrigen });
  configurarApp(app);
  await app.listen(config.puerto);
}

if (require.main === module) void bootstrap();
