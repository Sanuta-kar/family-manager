import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { expandOccurrences } from "./scheduling";
import { DeadlineDeps, markMissed, notifyOccurrence } from "./deadlines";
import { FcmPushClient, sendMissionReminderToChildDevices } from "./push";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const pushClient = new FcmPushClient();

export const missionQueue = new Queue("missions", { connection });

const deadlineDeps: DeadlineDeps = {
  prisma,
  queue: missionQueue,
  sendReminder: async (reminder) => {
    await sendMissionReminderToChildDevices(prisma, pushClient, reminder);
  }
};

const worker = new Worker(
  "missions",
  async (job) => {
    if (job.name === "notify-occurrence") {
      await notifyOccurrence(deadlineDeps, job.data.occurrenceId);
      return;
    }
    if (job.name === "mark-missed") {
      await markMissed(deadlineDeps, job.data.occurrenceId);
      return;
    }
    if (job.name === "expand-occurrences") {
      await expandOccurrences(prisma, missionQueue, job.data);
      return;
    }
    throw new Error(`Unknown mission job: ${job.name}`);
  },
  { connection }
);

worker.on("failed", (job, error) => {
  console.error("Mission job failed", job?.id, error);
});

async function bootstrap() {
  await missionQueue.add(
    "expand-occurrences",
    {},
    {
      jobId: "expand-occurrences-startup",
      removeOnComplete: true,
      attempts: 3
    }
  );
  await missionQueue.add(
    "expand-occurrences",
    {},
    {
      repeat: { every: 5 * 60_000 },
      jobId: "expand-occurrences-repeat",
      removeOnComplete: true,
      attempts: 3
    }
  );
  console.log("Family mission worker is running");
}

void bootstrap().catch((error) => {
  console.error("Failed to start family mission worker", error);
  process.exit(1);
});
