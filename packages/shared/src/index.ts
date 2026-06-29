import { ChatActionType, UserRole } from "./enums";

export * from "./enums";
export * from "./schemas";
export * from "./device-capabilities";

export type OpenClawAllowedAction =
  | "draft_schedule_change"
  | "recommend_snooze"
  | "write_child_message"
  | "answer_general_chat"
  | "read_device_context";

export type OpenClawRequest = {
  userId: string;
  role: UserRole;
  childProfileId?: string;
  personalityPresetId?: string;
  recentChatSummary: string;
  messageText: string;
  currentMissionContext?: Record<string, unknown>;
  scheduleContext?: Record<string, unknown>;
  allowedActions: OpenClawAllowedAction[];
  policyLimits: Record<string, unknown>;
};

export type OpenClawActionDraft = {
  type: ChatActionType;
  payload: Record<string, unknown>;
};

export type OpenClawResponse = {
  messageText: string;
  actionDraft?: OpenClawActionDraft;
  snoozeDecision?: "approve" | "deny" | "ask_parent";
  reason?: string;
  safetyFlags: string[];
};

export type AuthenticatedUser = {
  userId: string;
  familyId: string;
  role: UserRole;
  childProfileId?: string;
  deviceId?: string;
};

export type ScheduledTimeParts = {
  hours: number;
  minutes: number;
};

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

const dayMs = 24 * 60 * 60 * 1000;

export function parseScheduledTime(scheduledTime: string): ScheduledTimeParts {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(scheduledTime);
  if (!match) {
    throw new Error(`Invalid scheduled time: ${scheduledTime}`);
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function normalizeRecurrenceRule(recurrenceRule?: string | null) {
  const normalized = recurrenceRule?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "daily" || normalized === "freq=daily") {
    return "daily";
  }
  throw new Error(`Unsupported recurrence rule: ${recurrenceRule}`);
}

export function nextScheduledDateForTimezone(scheduledTime: string, timeZone = "UTC", now = new Date()) {
  const { hours, minutes } = parseScheduledTime(scheduledTime);
  let localDate = getLocalDateParts(now, timeZone);
  let scheduledFor = zonedDateTimeToUtc({ ...localDate, hours, minutes }, timeZone);

  if (scheduledFor.getTime() < now.getTime()) {
    localDate = addLocalDays(localDate, 1);
    scheduledFor = zonedDateTimeToUtc({ ...localDate, hours, minutes }, timeZone);
  }

  return scheduledFor;
}

export function occurrenceDatesForSchedule(
  scheduledTime: string,
  recurrenceRule?: string | null,
  timeZone = "UTC",
  now = new Date(),
  horizonDays = 7
) {
  const { hours, minutes } = parseScheduledTime(scheduledTime);
  const normalizedRecurrence = normalizeRecurrenceRule(recurrenceRule);
  let localDate = getLocalDateParts(now, timeZone);
  let scheduledFor = zonedDateTimeToUtc({ ...localDate, hours, minutes }, timeZone);

  if (!normalizedRecurrence) {
    return scheduledFor.getTime() >= now.getTime() ? [scheduledFor] : [];
  }

  if (scheduledFor.getTime() < now.getTime()) {
    localDate = addLocalDays(localDate, 1);
    scheduledFor = zonedDateTimeToUtc({ ...localDate, hours, minutes }, timeZone);
  }

  const end = new Date(now.getTime() + horizonDays * dayMs);
  const dates: Date[] = [];
  for (let nextLocalDate = localDate; ; nextLocalDate = addLocalDays(nextLocalDate, 1)) {
    const nextScheduledFor = zonedDateTimeToUtc({ ...nextLocalDate, hours, minutes }, timeZone);
    if (nextScheduledFor.getTime() > end.getTime()) {
      break;
    }
    dates.push(nextScheduledFor);
  }
  return dates;
}

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = getZonedDateTimeParts(date, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function zonedDateTimeToUtc(
  parts: LocalDateParts & { hours: number; minutes: number },
  timeZone: string
) {
  const desiredLocalTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, 0, 0);
  let utcTime = desiredLocalTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedDateTimeParts(new Date(utcTime), timeZone);
    const actualLocalTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const diff = desiredLocalTime - actualLocalTime;
    if (diff === 0) {
      return new Date(utcTime);
    }
    utcTime += diff;
  }

  return new Date(utcTime);
}

function getZonedDateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Could not format ${type} for timezone ${timeZone}`);
    }
    return Number(value);
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second")
  };
}
