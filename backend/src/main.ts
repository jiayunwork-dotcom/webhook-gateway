import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-*'],
    },
  });

  const config = app.get(ConfigService);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Webhook Gateway API')
    .setDescription('Multi-tenant Webhook Event Delivery Platform API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'API-Key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  logger.log('Synchronizing database schema...');
  const dataSource = app.get(DataSource);
  await dataSource.synchronize();
  logger.log('Database schema synchronized successfully');

  logger.log('Running column migrations for tenant API keys...');
  try {
    await dataSource.query(`
      ALTER TABLE IF EXISTS tenants
      ALTER COLUMN "apiPublicKey" TYPE varchar(255),
      ALTER COLUMN "apiPrivateKey" TYPE varchar(255),
      ALTER COLUMN "oldApiPrivateKey" TYPE varchar(255);
    `);
    logger.log('Tenant API key columns migrated to varchar(255)');
  } catch (migrationErr: any) {
    logger.warn(`Column migration skipped: ${migrationErr.message}`);
  }

  const port = config.appPort;
  await app.listen(port, '0.0.0.0');

  logger.log(`Webhook Gateway running on http://0.0.0.0:${port}`);
  logger.log(`API docs available at http://0.0.0.0:${port}/api/docs`);
  logger.log(`Health check available at http://0.0.0.0:${port}/health`);
}

bootstrap().catch(err => {
  console.error('Failed to bootstrap application:', err);
  process.exit(1);
});
