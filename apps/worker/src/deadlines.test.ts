import { describe, expect, it, vi } from "vitest";
import { enqueueMarkMissed, markMissed, notifyOccurrence } from "./deadlines";

function buildOccurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: "occ-1",
    familyId: "fam-1",
    childProfileId: "child-1",
    status: "scheduled",
    scheduledFor: new Date("2026-06-29T08:00:00.000Z"),
    currentDeadlineAt: null,
    template: { title: "Brush teeth" },
    ...overrides
  };
}

function buildDeps(occurrence: ReturnType<typeof buildOccurrence> | null) {
  const prisma = {
    missionOccurrence: {
      findUnique: vi.fn().mockResolvedValue(occurrence),
      update: vi.fn().mockResolvedValue({})
    },
    alert: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([])
  };
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const sendReminder = vi.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { deps: { prisma: prisma as any, queue, sendReminder }, prisma, queue, sendReminder };
}

const now = new Date("2026-06-29T08:00:00.000Z");

describe("enqueueMarkMissed", () => {
  it("adds a delayed mark-missed job keyed by the deadline", async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const deadline = new Date(now.getTime() + 10 * 60_000);
    await enqueueMarkMissed(queue, "occ-1", deadline, now);

    expect(queue.add).toHaveBeenCalledWith(
      "mark-missed",
      { occurrenceId: "occ-1" },
      expect.objectContaining({
        delay: 10 * 60_000,
        jobId: `mark-missed-occ-1-${deadline.getTime()}`
      })
    );
  });
});

describe("notifyOccurrence", () => {
  it("marks a scheduled occurrence notified, enqueues mark-missed, and sends one push", async () => {
    const { deps, prisma, queue, sendReminder } = buildDeps(buildOccurrence());
    await notifyOccurrence(deps, "occ-1", now);

    expect(prisma.missionOccurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "occ-1" },
        data: expect.objectContaining({ status: "notified" })
      })
    );
    expect(queue.add).toHaveBeenCalledWith("mark-missed", { occurrenceId: "occ-1" }, expect.any(Object));
    expect(sendReminder).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the occurrence is not scheduled", async () => {
    const { deps, prisma, queue, sendReminder } = buildDeps(buildOccurrence({ status: "completed" }));
    await notifyOccurrence(deps, "occ-1", now);

    expect(prisma.missionOccurrence.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(sendReminder).not.toHaveBeenCalled();
  });
});

describe("markMissed", () => {
  it("re-enqueues instead of failing when the deadline was pushed into the future (snoozed)", async () => {
    const futureDeadline = new Date(now.getTime() + 20 * 60_000);
    const { deps, prisma, queue } = buildDeps(
      buildOccurrence({ status: "snoozed", currentDeadlineAt: futureDeadline })
    );

    await markMissed(deps, "occ-1", now);

    expect(queue.add).toHaveBeenCalledWith(
      "mark-missed",
      { occurrenceId: "occ-1" },
      expect.objectContaining({ jobId: `mark-missed-occ-1-${futureDeadline.getTime()}` })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it("fails the occurrence and raises an alert when the deadline has passed", async () => {
    const pastDeadline = new Date(now.getTime() - 60_000);
    const { deps, prisma, queue } = buildDeps(
      buildOccurrence({ status: "notified", currentDeadlineAt: pastDeadline })
    );

    await markMissed(deps, "occ-1", now);

    expect(prisma.missionOccurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "occ-1" }, data: expect.objectContaining({ status: "failed" }) })
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ occurrenceId: "occ-1", title: "Mission missed" }) })
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does nothing for a closed occurrence", async () => {
    const { deps, prisma, queue } = buildDeps(buildOccurrence({ status: "completed" }));
    await markMissed(deps, "occ-1", now);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does nothing when the occurrence is missing", async () => {
    const { deps, prisma } = buildDeps(null);
    await markMissed(deps, "occ-1", now);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
