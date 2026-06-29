import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { MissionReminderPush } from "./push";

type MissionQueue = Pick<Queue, "add">;

export interface DeadlineDeps {
  prisma: PrismaClient;
  queue: MissionQueue;
  sendReminder: (reminder: MissionReminderPush) => Promise<void>;
}

/** Minutes a child has to act after a mission notifies before it is marked missed. */
export const NOTIFY_DEADLINE_MS = 15 * 60_000;

const CLOSED_STATUSES = ["completed", "failed", "cancelled", "parent_review"];

export async function enqueueMarkMissed(
  queue: MissionQueue,
  occurrenceId: string,
  deadlineAt: Date,
  now: Date = new Date()
) {
  await queue.add(
    "mark-missed",
    { occurrenceId },
    {
      delay: Math.max(0, deadlineAt.getTime() - now.getTime()),
      jobId: `mark-missed-${occurrenceId}-${deadlineAt.getTime()}`,
      removeOnComplete: true,
      attempts: 3
    }
  );
}

export async function notifyOccurrence(deps: DeadlineDeps, occurrenceId: string, now: Date = new Date()) {
  const occurrence = await deps.prisma.missionOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true }
  });
  if (!occurrence || occurrence.status !== "scheduled") {
    return;
  }

  const deadlineAt = new Date(now.getTime() + NOTIFY_DEADLINE_MS);
  await deps.prisma.missionOccurrence.update({
    where: { id: occurrenceId },
    data: { status: "notified", currentDeadlineAt: deadlineAt }
  });

  await enqueueMarkMissed(deps.queue, occurrenceId, deadlineAt, now);

  await deps.sendReminder({
    occurrenceId: occurrence.id,
    childProfileId: occurrence.childProfileId,
    title: occurrence.template.title,
    scheduledFor: occurrence.scheduledFor,
    deadlineAt
  });
}

export async function markMissed(deps: DeadlineDeps, occurrenceId: string, now: Date = new Date()) {
  const occurrence = await deps.prisma.missionOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { template: true }
  });
  if (!occurrence || CLOSED_STATUSES.includes(occurrence.status)) {
    return;
  }

  // Snoozed: the deadline was pushed forward, so reschedule the check instead of failing.
  if (occurrence.currentDeadlineAt && occurrence.currentDeadlineAt.getTime() > now.getTime()) {
    await enqueueMarkMissed(deps.queue, occurrenceId, occurrence.currentDeadlineAt, now);
    return;
  }

  await deps.prisma.$transaction([
    deps.prisma.missionOccurrence.update({
      where: { id: occurrenceId },
      data: { status: "failed", failedAt: now }
    }),
    deps.prisma.alert.create({
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
