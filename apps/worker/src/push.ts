import { createSign } from "crypto";
import { PrismaClient } from "@prisma/client";

type Fetch = typeof fetch;

type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FcmAccessToken = {
  access_token: string;
  expires_in: number;
};

export type MissionReminderPush = {
  occurrenceId: string;
  childProfileId: string;
  title: string;
  scheduledFor: Date;
  deadlineAt: Date;
};

const fcmScope = "https://www.googleapis.com/auth/firebase.messaging";
const oauthTokenUrl = "https://oauth2.googleapis.com/token";

export function parseFcmServiceAccount(rawJson?: string) {
  if (!rawJson?.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(rawJson) as Partial<FcmServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FCM service account JSON must include project_id, client_email, and private_key");
  }

  return parsed as FcmServiceAccount;
}

export function buildMissionReminderMessage(token: string, reminder: MissionReminderPush) {
  return {
    message: {
      token,
      notification: {
        title: "Mission reminder",
        body: reminder.title
      },
      data: {
        type: "mission_reminder",
        occurrenceId: reminder.occurrenceId,
        childProfileId: reminder.childProfileId,
        title: reminder.title,
        scheduledFor: reminder.scheduledFor.toISOString(),
        deadlineAt: reminder.deadlineAt.toISOString()
      },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "mission_reminders",
          click_action: "MISSION_REMINDER"
        }
      }
    }
  };
}

export class FcmPushClient {
  private readonly serviceAccount?: FcmServiceAccount;
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    rawServiceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON,
    private readonly fetchImpl: Fetch = fetch
  ) {
    this.serviceAccount = parseFcmServiceAccount(rawServiceAccountJson);
  }

  get configured() {
    return Boolean(this.serviceAccount);
  }

  async sendMissionReminder(token: string, reminder: MissionReminderPush) {
    if (!this.serviceAccount) {
      return { skipped: true as const, reason: "FCM service account is not configured" };
    }

    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${this.serviceAccount.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(buildMissionReminderMessage(token, reminder))
      }
    );

    if (!response.ok) {
      throw new Error(`FCM send failed with HTTP ${response.status}: ${await response.text()}`);
    }

    return { skipped: false as const, response: await response.json() };
  }

  private async getAccessToken() {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > now) {
      return this.accessToken.value;
    }
    if (!this.serviceAccount) {
      throw new Error("FCM service account is not configured");
    }

    const response = await this.fetchImpl(oauthTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: createJwtAssertion(this.serviceAccount, Math.floor(now / 1000))
      })
    });
    if (!response.ok) {
      throw new Error(`FCM auth failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const token = (await response.json()) as FcmAccessToken;
    this.accessToken = {
      value: token.access_token,
      expiresAt: now + token.expires_in * 1000
    };
    return token.access_token;
  }
}

export async function sendMissionReminderToChildDevices(
  prisma: PrismaClient,
  pushClient: Pick<FcmPushClient, "sendMissionReminder" | "configured">,
  reminder: MissionReminderPush
) {
  const devices = await prisma.device.findMany({
    where: {
      childProfileId: reminder.childProfileId,
      fcmToken: { not: null }
    },
    select: { id: true, fcmToken: true }
  });

  if (devices.length === 0) {
    console.log(`No FCM tokens for child ${reminder.childProfileId}`);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (!pushClient.configured) {
    console.log("FCM service account is not configured; skipping push delivery");
    return { sent: 0, failed: 0, skipped: devices.length };
  }

  const results = await Promise.allSettled(
    devices.map((device) => pushClient.sendMissionReminder(device.fcmToken!, reminder))
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  const sent = results.length - failed;
  if (failed > 0) {
    console.error(`Failed to send ${failed} mission reminder push notification(s)`);
  }
  return { sent, failed, skipped: 0 };
}

function createJwtAssertion(serviceAccount: FcmServiceAccount, issuedAtSeconds: number) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const expiresAtSeconds = issuedAtSeconds + 3600;
  const claimSet = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: fcmScope,
      aud: oauthTokenUrl,
      exp: expiresAtSeconds,
      iat: issuedAtSeconds
    })
  );
  const unsigned = `${header}.${claimSet}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
