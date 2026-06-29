import {
  ChatActionType,
  OpenClawAllowedAction,
  OpenClawRequest,
  OpenClawResponse,
  UserRole
} from "@family-manager/shared";

/** The `allowedActions` entry a given action draft type requires to be dispatched. */
export function requiredActionFor(type: ChatActionType): OpenClawAllowedAction {
  if (type === ChatActionType.ReadDeviceContext) {
    return "read_device_context";
  }
  return "draft_schedule_change";
}

/** Deterministic, OpenClaw-free response used when no real OpenClaw backend is configured. */
export function deterministicFallback(request: OpenClawRequest): OpenClawResponse {
  const match = request.messageText.match(/remind me to (.+?) (?:every day|daily) at ([0-2]?\d:[0-5]\d)/i);
  if (match && request.allowedActions.includes("draft_schedule_change")) {
    return {
      messageText: "I can draft that reminder. Confirm it in the app before I save anything.",
      actionDraft: {
        type: ChatActionType.CreateMissionTemplate,
        payload: {
          title: match[1].trim(),
          childProfileId: request.childProfileId,
          scheduledTime: match[2],
          recurrenceRule: "FREQ=DAILY",
          protected: request.role === UserRole.Parent,
          proofPolicy: { mode: "all", rules: [{ type: "tap_done" }] },
          snoozePolicy: {
            allowed: true,
            maxSnoozes: 2,
            defaultMinutes: 10,
            allowedMinutes: [5, 10, 15],
            openclawCanApprove: true
          },
          rewardPolicy: { coinsOnCompletion: 1 }
        }
      },
      safetyFlags: []
    };
  }

  const text = request.messageText.toLowerCase();
  if (request.allowedActions.includes("read_device_context") && /calendar|schedule|agenda/.test(text)) {
    return {
      messageText: "I can read your calendar once you confirm.",
      actionDraft: {
        type: ChatActionType.ReadDeviceContext,
        payload: { kind: "calendar", range: "today" }
      },
      safetyFlags: []
    };
  }

  return {
    messageText: "I am here in the family app. I can chat and draft reminders for confirmation.",
    safetyFlags: []
  };
}

/** Strips any action draft the requester is not allowed to receive (defense in depth). */
export function sanitizeResponse(request: OpenClawRequest, response: OpenClawResponse): OpenClawResponse {
  if (response.actionDraft && !request.allowedActions.includes(requiredActionFor(response.actionDraft.type))) {
    return {
      messageText: response.messageText,
      reason: "Removed unsupported action draft.",
      safetyFlags: [...response.safetyFlags, "action_removed"]
    };
  }
  return {
    messageText: response.messageText,
    actionDraft: response.actionDraft,
    snoozeDecision: response.snoozeDecision,
    reason: response.reason,
    safetyFlags: response.safetyFlags ?? []
  };
}
