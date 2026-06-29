import { describe, expect, it } from "vitest";
import { ChatActionType, OpenClawAllowedAction, OpenClawRequest, UserRole } from "@family-manager/shared";
import { deterministicFallback, requiredActionFor, sanitizeResponse } from "./fallback";

function buildRequest(overrides: Partial<OpenClawRequest> = {}): OpenClawRequest {
  return {
    userId: "user-1",
    role: UserRole.Child,
    childProfileId: "child-1",
    recentChatSummary: "",
    messageText: "",
    allowedActions: ["answer_general_chat", "draft_schedule_change", "read_device_context"],
    policyLimits: {},
    ...overrides
  };
}

describe("requiredActionFor", () => {
  it("maps read_device_context drafts to the read_device_context action", () => {
    expect(requiredActionFor(ChatActionType.ReadDeviceContext)).toBe("read_device_context");
  });

  it("maps schedule drafts to draft_schedule_change", () => {
    expect(requiredActionFor(ChatActionType.CreateMissionTemplate)).toBe("draft_schedule_change");
  });
});

describe("deterministicFallback", () => {
  it("drafts a daily reminder from a reminder phrase", () => {
    const response = deterministicFallback(
      buildRequest({ messageText: "remind me to read a book every day at 08:00" })
    );
    expect(response.actionDraft?.type).toBe(ChatActionType.CreateMissionTemplate);
    expect(response.actionDraft?.payload).toMatchObject({ title: "read a book", scheduledTime: "08:00" });
  });

  it("drafts a read_device_context capability from a calendar phrase", () => {
    const response = deterministicFallback(
      buildRequest({ messageText: "what's on my calendar today?" })
    );
    expect(response.actionDraft?.type).toBe(ChatActionType.ReadDeviceContext);
    expect(response.actionDraft?.payload).toMatchObject({ kind: "calendar" });
  });

  it("does not draft a reminder when draft_schedule_change is not allowed", () => {
    const allowed: OpenClawAllowedAction[] = ["answer_general_chat"];
    const response = deterministicFallback(
      buildRequest({ messageText: "remind me to read every day at 08:00", allowedActions: allowed })
    );
    expect(response.actionDraft).toBeUndefined();
  });

  it("returns a plain message when nothing matches", () => {
    const response = deterministicFallback(buildRequest({ messageText: "hello there" }));
    expect(response.actionDraft).toBeUndefined();
    expect(response.messageText).toContain("family app");
  });
});

describe("sanitizeResponse", () => {
  it("removes an action draft the requester is not allowed to receive", () => {
    const request = buildRequest({ allowedActions: ["answer_general_chat"] });
    const sanitized = sanitizeResponse(request, {
      messageText: "ok",
      actionDraft: { type: ChatActionType.ReadDeviceContext, payload: { kind: "calendar" } },
      safetyFlags: []
    });
    expect(sanitized.actionDraft).toBeUndefined();
    expect(sanitized.safetyFlags).toContain("action_removed");
  });

  it("passes through an allowed action draft", () => {
    const request = buildRequest();
    const sanitized = sanitizeResponse(request, {
      messageText: "ok",
      actionDraft: { type: ChatActionType.ReadDeviceContext, payload: { kind: "calendar" } },
      safetyFlags: []
    });
    expect(sanitized.actionDraft?.type).toBe(ChatActionType.ReadDeviceContext);
  });
});
