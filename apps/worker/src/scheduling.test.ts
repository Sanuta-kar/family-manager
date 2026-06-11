import { describe, expect, it } from "vitest";
import { occurrenceDatesForTemplate, parseScheduledTime } from "./scheduling";

const template = {
  id: "template-1",
  familyId: "family-1",
  childProfileId: "child-1",
  scheduledTime: "10:30",
  recurrenceRule: "daily"
};

describe("parseScheduledTime", () => {
  it("parses HH:mm times", () => {
    expect(parseScheduledTime("07:05")).toEqual({ hours: 7, minutes: 5 });
  });

  it("rejects invalid times", () => {
    expect(() => parseScheduledTime("24:00")).toThrow("Invalid scheduled time");
    expect(() => parseScheduledTime("9:00")).toThrow("Invalid scheduled time");
  });
});

describe("occurrenceDatesForTemplate", () => {
  it("expands daily templates across the horizon", () => {
    const dates = occurrenceDatesForTemplate(template, new Date("2026-06-11T09:00:00.000Z"), 2);

    expect(dates.map((date) => date.toISOString())).toEqual([
      "2026-06-11T10:30:00.000Z",
      "2026-06-12T10:30:00.000Z"
    ]);
  });

  it("starts tomorrow when today's scheduled time already passed", () => {
    const dates = occurrenceDatesForTemplate(template, new Date("2026-06-11T11:00:00.000Z"), 1);

    expect(dates.map((date) => date.toISOString())).toEqual([
      "2026-06-12T10:30:00.000Z"
    ]);
  });

  it("does not create stale one-shot occurrences", () => {
    const dates = occurrenceDatesForTemplate(
      { ...template, recurrenceRule: null },
      new Date("2026-06-11T11:00:00.000Z"),
      7
    );

    expect(dates).toEqual([]);
  });

  it("rejects unsupported recurrence rules", () => {
    expect(() =>
      occurrenceDatesForTemplate(
        { ...template, recurrenceRule: "weekly" },
        new Date("2026-06-11T09:00:00.000Z"),
        7
      )
    ).toThrow("Unsupported recurrence rule");
  });
});
