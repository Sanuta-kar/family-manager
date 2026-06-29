import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env";

async function bootstrap() {
  const { warnings } = validateEnv();
  for (const warning of warnings) {
    console.warn(`[config] ${warning}`);
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  });
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.setGlobalPrefix("api");
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 4000) });
}

void bootstrap();

