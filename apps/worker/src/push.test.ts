import { describe, expect, it } from "vitest";
import { buildMissionReminderMessage, FcmPushClient, parseFcmServiceAccount } from "./push";

describe("parseFcmServiceAccount", () => {
  it("treats an empty env value as disabled push", () => {
    expect(parseFcmServiceAccount("")).toBeUndefined();
    expect(parseFcmServiceAccount(undefined)).toBeUndefined();
  });

  it("rejects incomplete service account JSON", () => {
    expect(() => parseFcmServiceAccount(JSON.stringify({ project_id: "family-app" }))).toThrow(
      "FCM service account JSON"
    );
  });
});

describe("buildMissionReminderMessage", () => {
  it("builds a high-priority Android mission reminder payload", () => {
    const message = buildMissionReminderMessage("fcm-token", {
      occurrenceId: "occurrence-1",
      childProfileId: "child-1",
      title: "Brush teeth",
      scheduledFor: new Date("2026-06-11T18:30:00.000Z"),
      deadlineAt: new Date("2026-06-11T18:45:00.000Z")
    });

    expect(message.message.token).toBe("fcm-token");
    expect(message.message.android.priority).toBe("HIGH");
    expect(message.message.data).toEqual({
      type: "mission_reminder",
      occurrenceId: "occurrence-1",
      childProfileId: "child-1",
      title: "Brush teeth",
      scheduledFor: "2026-06-11T18:30:00.000Z",
      deadlineAt: "2026-06-11T18:45:00.000Z"
    });
  });
});

describe("FcmPushClient", () => {
  it("skips sends when credentials are not configured", async () => {
    const client = new FcmPushClient("", async () => {
      throw new Error("fetch should not be called");
    });

    await expect(
      client.sendMissionReminder("fcm-token", {
        occurrenceId: "occurrence-1",
        childProfileId: "child-1",
        title: "Brush teeth",
        scheduledFor: new Date("2026-06-11T18:30:00.000Z"),
        deadlineAt: new Date("2026-06-11T18:45:00.000Z")
      })
    ).resolves.toEqual({ skipped: true, reason: "FCM service account is not configured" });
  });
});
