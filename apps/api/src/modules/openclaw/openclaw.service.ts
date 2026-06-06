import { Injectable } from "@nestjs/common";
import {
  ChatActionType,
  OpenClawRequest,
  OpenClawResponse,
  UserRole
} from "@family-manager/shared";

@Injectable()
export class OpenClawService {
  private readonly adapterUrl = process.env.OPENCLAW_ADAPTER_URL;

  async ask(request: OpenClawRequest): Promise<OpenClawResponse> {
    if (this.adapterUrl) {
      try {
        const response = await fetch(`${this.adapterUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        });
        if (response.ok) {
          return this.normalize(await response.json());
        }
      } catch {
        // Fall through to local deterministic fallback so the private app remains usable.
      }
    }

    return this.fallback(request);
  }

  private normalize(value: unknown): OpenClawResponse {
    const candidate = value as Partial<OpenClawResponse>;
    return {
      messageText: candidate.messageText ?? "I am here. Tell me what you need.",
      actionDraft: candidate.actionDraft,
      snoozeDecision: candidate.snoozeDecision,
      reason: candidate.reason,
      safetyFlags: candidate.safetyFlags ?? []
    };
  }

  private fallback(request: OpenClawRequest): OpenClawResponse {
    const draft = this.parseReminderDraft(request);
    if (draft) {
      return {
        messageText: "I can create that reminder. Please confirm the details before I save it.",
        actionDraft: draft,
        reason: "Parsed reminder request with local fallback parser.",
        safetyFlags: []
      };
    }

    return {
      messageText:
        request.role === UserRole.Child
          ? "I am listening. We can talk here, and I can help with reminders when you ask."
          : "I am ready. I can help manage family reminders and draft schedule changes for confirmation.",
      safetyFlags: []
    };
  }

  private parseReminderDraft(request: OpenClawRequest) {
    if (!request.allowedActions.includes("draft_schedule_change")) {
      return undefined;
    }

    const match = request.messageText.match(/remind me to (.+?) (?:every day|daily) at ([0-2]?\d:[0-5]\d)/i);
    if (!match) {
      return undefined;
    }

    return {
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
    };
  }
}

