import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { beforeAll, describe, expect, it } from "vitest";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function redisAvailable(url: string): Promise<boolean> {
  const probe = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 1000
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    try {
      probe.disconnect();
    } catch {
      // ignore
    }
  }
}

let available = false;

beforeAll(async () => {
  available = await redisAvailable(redisUrl);
  if (!available) {
    // eslint-disable-next-line no-console
    console.warn(
      `[worker] Redis not reachable at ${redisUrl} — skipping smoke test. ` +
        "Start it with: docker compose -p family-manager -f infra/docker/docker-compose.yml up -d redis"
    );
  }
});

describe("worker Redis smoke", () => {
  it("enqueues a job and the worker processes it end-to-end", async (ctx) => {
    if (!available) {
      ctx.skip();
      return;
    }
    const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queueName = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const queue = new Queue(queueName, { connection: queueConnection });

    let resolveProcessed: (value: number) => void;
    const processed = new Promise<number>((resolve) => {
      resolveProcessed = resolve;
    });

    const worker = new Worker(
      queueName,
      async (job) => {
        resolveProcessed(job.data.value as number);
        return job.data.value;
      },
      { connection: workerConnection }
    );
    await worker.waitUntilReady();

    try {
      await queue.add("smoke-job", { value: 42 });
      await expect(processed).resolves.toBe(42);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      queueConnection.disconnect();
      workerConnection.disconnect();
    }
  }, 20_000);
});
