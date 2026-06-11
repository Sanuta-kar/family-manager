import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

type MissionQueue = Pick<Queue, "add">;

type MissionTemplateForScheduling = {
  id: string;
  familyId: string;
  childProfileId: string;
  scheduledTime: string;
  recurrenceRule: string | null;
};

type MissionOccurrenceForNotification = {
  id: string;
  scheduledFor: Date;
};

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export function parseScheduledTime(scheduledTime: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(scheduledTime);
  if (!match) {
    throw new Error(`Invalid scheduled time: ${scheduledTime}`);
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function occurrenceDatesForTemplate(template: MissionTemplateForScheduling, now = new Date(), horizonDays = 7) {
  const { hours, minutes } = parseScheduledTime(template.scheduledTime);
  const first = new Date(now);
  first.setHours(hours, minutes, 0, 0);

  const recurrenceRule = template.recurrenceRule?.trim().toLowerCase();
  if (!recurrenceRule) {
    return first.getTime() >= now.getTime() ? [first] : [];
  }

  if (recurrenceRule !== "daily") {
    throw new Error(`Unsupported recurrence rule for template ${template.id}: ${template.recurrenceRule}`);
  }

  if (first.getTime() < now.getTime()) {
    first.setDate(first.getDate() + 1);
  }

  const end = new Date(now.getTime() + horizonDays * dayMs);
  const dates: Date[] = [];
  for (const scheduledFor = new Date(first); scheduledFor <= end; scheduledFor.setDate(scheduledFor.getDate() + 1)) {
    dates.push(new Date(scheduledFor));
  }
  return dates;
}

export async function expandOccurrences(
  prisma: PrismaClient,
  queue: MissionQueue,
  options: { now?: Date; horizonDays?: number } = {}
) {
  const now = options.now ?? new Date();
  const horizonDays = options.horizonDays ?? 7;
  const templates = await prisma.missionTemplate.findMany({
    select: {
      id: true,
      familyId: true,
      childProfileId: true,
      scheduledTime: true,
      recurrenceRule: true
    }
  });

  for (const template of templates) {
    const scheduledDates = occurrenceDatesForTemplate(template, now, horizonDays);
    if (scheduledDates.length === 0) {
      continue;
    }

    await prisma.missionOccurrence.createMany({
      data: scheduledDates.map((scheduledFor) => ({
        familyId: template.familyId,
        templateId: template.id,
        childProfileId: template.childProfileId,
        scheduledFor,
        status: "scheduled"
      })),
      skipDuplicates: true
    });
  }

  await enqueueScheduledNotifications(prisma, queue, now, horizonDays);
}

export async function enqueueScheduledNotifications(
  prisma: PrismaClient,
  queue: MissionQueue,
  now = new Date(),
  horizonDays = 7
) {
  const horizon = new Date(now.getTime() + horizonDays * dayMs);
  const occurrences: MissionOccurrenceForNotification[] = await prisma.missionOccurrence.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lte: horizon }
    },
    select: {
      id: true,
      scheduledFor: true
    }
  });

  for (const occurrence of occurrences) {
    await queue.add(
      "notify-occurrence",
      { occurrenceId: occurrence.id },
      {
        delay: Math.max(0, occurrence.scheduledFor.getTime() - now.getTime()),
        jobId: `notify-occurrence-${occurrence.id}`,
        removeOnComplete: true,
        attempts: 3
      }
    );
  }
}
