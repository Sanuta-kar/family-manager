import Fastify from "fastify";
import {
  ChatActionType,
  OpenClawRequest,
  OpenClawResponse,
  UserRole
} from "@family-manager/shared";

const server = Fastify({ logger: true });
const openClawBaseUrl = process.env.OPENCLAW_BASE_URL;

server.get("/health", async () => ({ ok: true }));

server.post<{ Body: OpenClawRequest }>("/chat", async (request): Promise<OpenClawResponse> => {
  const response = openClawBaseUrl
    ? await askOpenClaw(request.body)
    : deterministicFallback(request.body);

  return sanitizeResponse(request.body, response);
});

async function askOpenClaw(request: OpenClawRequest): Promise<OpenClawResponse> {
  const response = await fetch(`${openClawBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`OpenClaw returned ${response.status}`);
  }

  return response.json() as Promise<OpenClawResponse>;
}

function deterministicFallback(request: OpenClawRequest): OpenClawResponse {
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

  return {
    messageText: "I am here in the family app. I can chat and draft reminders for confirmation.",
    safetyFlags: []
  };
}

function sanitizeResponse(request: OpenClawRequest, response: OpenClawResponse): OpenClawResponse {
  if (response.actionDraft && !request.allowedActions.includes("draft_schedule_change")) {
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

server.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 4010) });

