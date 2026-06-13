import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import {
  normalizeRecurrenceRule,
  occurrenceDatesForSchedule,
  parseScheduledTime
} from "@family-manager/shared";

type MissionQueue = Pick<Queue, "add">;

type MissionTemplateForScheduling = {
  id: string;
  familyId: string;
  childProfileId: string;
  scheduledTime: string;
  recurrenceRule: string | null;
  timezone?: string | null;
};

type MissionOccurrenceForNotification = {
  id: string;
  scheduledFor: Date;
};

const dayMs = 24 * 60 * 60 * 1000;

export { parseScheduledTime };

export function occurrenceDatesForTemplate(template: MissionTemplateForScheduling, now = new Date(), horizonDays = 7) {
  let recurrenceRule: string | undefined;
  try {
    recurrenceRule = normalizeRecurrenceRule(template.recurrenceRule);
  } catch {
    throw new Error(`Unsupported recurrence rule for template ${template.id}: ${template.recurrenceRule}`);
  }

  return occurrenceDatesForSchedule(
    template.scheduledTime,
    recurrenceRule,
    template.timezone ?? "UTC",
    now,
    horizonDays
  );
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
      recurrenceRule: true,
      childProfile: { select: { timezone: true } }
    }
  });

  for (const template of templates) {
    const scheduledDates = occurrenceDatesForTemplate(
      { ...template, timezone: template.childProfile.timezone },
      now,
      horizonDays
    );
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
