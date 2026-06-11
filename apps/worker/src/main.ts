import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { expandOccurrences } from "./scheduling";
import { FcmPushClient, sendMissionReminderToChildDevices } from "./push";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const pushClient = new FcmPushClient();

export const missionQueue = new Queue("missions", { connection });

const worker = new Worker(
  "missions",
  async (job) => {
    if (job.name === "notify-occurrence") {
      await notifyOccurrence(job.data.occurrenceId);
      return;
    }
    if (job.name === "mark-missed") {
      await markMissed(job.data.occurrenceId);
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

async function notifyOccurrence(occurrenceId: string) {
  const occurrence = await prisma.missionOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true }
  });
  if (!occurrence || occurrence.status !== "scheduled") {
    return;
  }

  await prisma.missionOccurrence.update({
    where: { id: occurrenceId },
    data: { status: "notified", currentDeadlineAt: new Date(Date.now() + 15 * 60_000) }
  });
  const deadlineAt = new Date(Date.now() + 15 * 60_000);

  await missionQueue.add(
    "mark-missed",
    { occurrenceId },
    { delay: 15 * 60_000, removeOnComplete: true, attempts: 3 }
  );

  await sendMissionReminderToChildDevices(prisma, pushClient, {
    occurrenceId: occurrence.id,
    childProfileId: occurrence.childProfileId,
    title: occurrence.template.title,
    scheduledFor: occurrence.scheduledFor,
    deadlineAt
  });
}

async function markMissed(occurrenceId: string) {
  const occurrence = await prisma.missionOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true }
  });
  if (!occurrence || ["completed", "failed", "cancelled"].includes(occurrence.status)) {
    return;
  }

  await prisma.$transaction([
    prisma.missionOccurrence.update({
      where: { id: occurrenceId },
      data: { status: "failed", failedAt: new Date() }
    }),
    prisma.alert.create({
      data: {
        familyId: occurrence.familyId,
        childProfileId: occurrence.childProfileId,
        occurrenceId,
        title: "Mission missed",
        message: `${occurrence.template.title} was not completed by the deadline.`
      }
    })
  ]);
}

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
