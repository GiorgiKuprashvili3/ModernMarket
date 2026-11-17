import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const prefix = config.getOrThrow<string>('API_PREFIX');
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });

  // Reject unknown properties and coerce types; every DTO is validated.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('Modernmarket API')
      .setDescription('Multi-vendor marketplace API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(config.getOrThrow<number>('API_PORT'));
}

void bootstrap();
