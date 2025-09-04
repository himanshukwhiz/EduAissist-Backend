import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // Debug logging for environment variables in production
  if (process.env.NODE_ENV === 'production') {
    console.log('Database Configuration:');
    console.log('DB_TYPE:', process.env.DB_TYPE);
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_PORT:', process.env.DB_PORT);
    console.log('DB_USERNAME:', process.env.DB_USERNAME);
    console.log('DB_DATABASE:', process.env.DB_DATABASE);
    console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET' : 'NOT SET');
    
    console.log('\nOAuth Configuration:');
    console.log('BACKEND_BASE_URL:', process.env.BACKEND_BASE_URL);
    console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
  }
  
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'https://eduaissist.vercel.app',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`EduAIssist Backend running on port ${port}`);
}

bootstrap();
