import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();

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

  await missionQueue.add(
    "mark-missed",
    { occurrenceId },
    { delay: 15 * 60_000, removeOnComplete: true, attempts: 3 }
  );

  // FCM dispatch will be added behind a PushService. This worker owns the timing boundary.
  console.log(`Notify child ${occurrence.childProfileId}: ${occurrence.template.title}`);
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

console.log("Family mission worker is running");

