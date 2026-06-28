import { Test } from "@nestjs/testing";
import multipart from "@fastify/multipart";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../../src/app.module";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://family:family@localhost:5433/family_manager_test?schema=public";

/**
 * Probes the integration test database so the suite can skip cleanly (rather than
 * fail) in environments where Postgres is not running.
 */
export async function isTestDbAvailable(): Promise<boolean> {
  const probe = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await probe.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect();
  }
}

export interface TestApp {
  app: NestFastifyApplication;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.setGlobalPrefix("api");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

  return {
    app,
    prisma,
    close: async () => {
      await prisma.$disconnect();
      await app.close();
    }
  };
}

/** Empties every table (except the migration bookkeeping) for per-test isolation. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  );
  if (rows.length === 0) {
    return;
  }
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Uploads a single file as multipart/form-data (field name "file"). */
export async function uploadFile(
  app: NestFastifyApplication,
  options: {
    url: string;
    token?: string;
    buffer: Buffer;
    filename: string;
    contentType: string;
  }
): Promise<{ status: number; body: any }> {
  const boundary = `----testboundary${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${options.filename}"\r\n` +
      `Content-Type: ${options.contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([head, options.buffer, tail]);

  const headers: Record<string, string> = {
    "content-type": `multipart/form-data; boundary=${boundary}`
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const raw = await app.inject({ method: "POST", url: options.url, headers, payload });
  let body: unknown = undefined;
  if (raw.body) {
    try {
      body = JSON.parse(raw.body);
    } catch {
      body = raw.body;
    }
  }
  return { status: raw.statusCode, body };
}

type InjectResult = Awaited<ReturnType<NestFastifyApplication["inject"]>>;

/** Thin helper around Fastify's inject that JSON-encodes the body and returns parsed JSON. */
export async function request(
  app: NestFastifyApplication,
  options: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    url: string;
    token?: string;
    payload?: unknown;
  }
): Promise<{ status: number; body: any; raw: InjectResult }> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.payload !== undefined) {
    headers["content-type"] = "application/json";
  }
  const raw = await app.inject({
    method: options.method,
    url: options.url,
    headers,
    payload: options.payload === undefined ? undefined : JSON.stringify(options.payload)
  });
  let body: unknown = undefined;
  const text = raw.body;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: raw.statusCode, body, raw };
}
