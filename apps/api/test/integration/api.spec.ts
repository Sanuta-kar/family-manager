import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { PrismaClient } from "@prisma/client";
import { createTestApp, isTestDbAvailable, request, truncateAll, uploadFile } from "./harness";

const dbAvailable = await isTestDbAvailable();
if (!dbAvailable) {
  // eslint-disable-next-line no-console
  console.warn(
    "[integration] test database not reachable — skipping API integration tests. " +
      "Start Postgres and create/migrate family_manager_test (see docs/testing.md)."
  );
}

const suite = dbAvailable ? describe : describe.skip;

// --- shared fixtures ---

const PARENT = {
  familyName: "Test Family",
  name: "Pat Parent",
  email: "parent@test.local",
  password: "password123"
};

function tapDoneTemplate(childProfileId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: "Brush teeth",
    childProfileId,
    scheduledTime: "08:00",
    protected: false,
    proofPolicy: { mode: "any", rules: [{ type: "tap_done" }] },
    snoozePolicy: {
      allowed: true,
      maxSnoozes: 2,
      defaultMinutes: 10,
      allowedMinutes: [5, 10, 15],
      openclawCanApprove: true
    },
    rewardPolicy: { coinsOnCompletion: 5 },
    ...overrides
  };
}

function photoTemplate(childProfileId: string) {
  return tapDoneTemplate(childProfileId, {
    title: "Photo of homework",
    proofPolicy: { mode: "any", rules: [{ type: "photo" }] },
    rewardPolicy: { coinsOnCompletion: 0 }
  });
}

// Minimal valid PNG header bytes; storage only checks the declared mime type.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6]);

suite("API integration", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ app, prisma, close } = await createTestApp());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  async function bootstrapParent() {
    const res = await request(app, {
      method: "POST",
      url: "/api/auth/parent/bootstrap",
      payload: PARENT
    });
    return res;
  }

  async function setupParentAndChild() {
    const boot = await bootstrapParent();
    const parentToken = boot.body.accessToken as string;

    const childRes = await request(app, {
      method: "POST",
      url: "/api/children",
      token: parentToken,
      payload: { name: "Ada" }
    });
    const childId = childRes.body.id as string;

    const codeRes = await request(app, {
      method: "POST",
      url: "/api/devices/pairing-codes",
      token: parentToken,
      payload: { childProfileId: childId }
    });
    const code = codeRes.body.code as string;

    const claimRes = await request(app, {
      method: "POST",
      url: "/api/devices/claim",
      payload: { code, deviceName: "Pixel", platform: "android" }
    });
    const childToken = claimRes.body.accessToken as string;
    const childProfileId = claimRes.body.childProfileId as string;

    return { parentToken, childToken, childId, childProfileId };
  }

  async function pairAdditionalChild(parentToken: string, name: string) {
    const childRes = await request(app, {
      method: "POST",
      url: "/api/children",
      token: parentToken,
      payload: { name }
    });
    const childId = childRes.body.id as string;
    const codeRes = await request(app, {
      method: "POST",
      url: "/api/devices/pairing-codes",
      token: parentToken,
      payload: { childProfileId: childId }
    });
    const claimRes = await request(app, {
      method: "POST",
      url: "/api/devices/claim",
      payload: { code: codeRes.body.code, deviceName: "Tablet", platform: "android" }
    });
    return { childToken: claimRes.body.accessToken as string, childProfileId: childId };
  }

  // --- auth happy path ---

  describe("auth", () => {
    it("bootstraps a parent, logs in, and refreshes tokens", async () => {
      const boot = await bootstrapParent();
      expect(boot.status).toBe(201);
      expect(typeof boot.body.accessToken).toBe("string");
      expect(typeof boot.body.refreshToken).toBe("string");
      expect(boot.body.user.role).toBe("parent");

      const login = await request(app, {
        method: "POST",
        url: "/api/auth/login",
        payload: { email: PARENT.email, password: PARENT.password }
      });
      expect(login.status).toBe(201);
      expect(typeof login.body.accessToken).toBe("string");

      const refresh = await request(app, {
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: boot.body.refreshToken }
      });
      expect(refresh.status).toBe(201);
      expect(typeof refresh.body.accessToken).toBe("string");
    });

    it("rejects login with the wrong password", async () => {
      await bootstrapParent();
      const login = await request(app, {
        method: "POST",
        url: "/api/auth/login",
        payload: { email: PARENT.email, password: "wrong-password" }
      });
      expect(login.status).toBe(401);
    });
  });

  // --- validation (the new behavior: clean 400 instead of a 500) ---

  describe("validation", () => {
    it("rejects a malformed bootstrap email with 400 and field errors", async () => {
      const res = await request(app, {
        method: "POST",
        url: "/api/auth/parent/bootstrap",
        payload: { ...PARENT, email: "not-an-email" }
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain("email");
    });

    it("rejects login missing a password with 400", async () => {
      const res = await request(app, {
        method: "POST",
        url: "/api/auth/login",
        payload: { email: PARENT.email }
      });
      expect(res.status).toBe(400);
    });

    it("rejects a device claim missing platform with 400 (not a 500)", async () => {
      const res = await request(app, {
        method: "POST",
        url: "/api/devices/claim",
        payload: { code: "ABC123", deviceName: "Pixel" }
      });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain("platform");
    });

    it("rejects a mission template with a bad scheduledTime with 400", async () => {
      const { parentToken, childId } = await setupParentAndChild();
      const res = await request(app, {
        method: "POST",
        url: "/api/mission-templates",
        token: parentToken,
        payload: tapDoneTemplate(childId, { scheduledTime: "8am" })
      });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { path: string }) => e.path)).toContain("scheduledTime");
    });
  });

  // --- pairing + claim ---

  describe("pairing", () => {
    it("pairs a child device and serves the child's today list", async () => {
      const { childToken, childProfileId } = await setupParentAndChild();
      expect(typeof childToken).toBe("string");
      expect(typeof childProfileId).toBe("string");

      const today = await request(app, {
        method: "GET",
        url: `/api/children/${childProfileId}/missions/today`,
        token: childToken
      });
      expect(today.status).toBe(200);
      expect(Array.isArray(today.body)).toBe(true);
    });
  });

  // --- RBAC ---

  describe("rbac", () => {
    it("forbids a child from creating a protected mission", async () => {
      const { childToken, childProfileId } = await setupParentAndChild();
      const res = await request(app, {
        method: "POST",
        url: "/api/mission-templates",
        token: childToken,
        payload: tapDoneTemplate(childProfileId, { protected: true })
      });
      expect(res.status).toBe(403);
    });
  });

  // --- proof rejection ---

  describe("proof", () => {
    it("rejects a proof type the mission does not accept with 400", async () => {
      const { parentToken, childId } = await setupParentAndChild();
      const created = await request(app, {
        method: "POST",
        url: "/api/mission-templates",
        token: parentToken,
        payload: tapDoneTemplate(childId, {
          proofPolicy: { mode: "any", rules: [{ type: "photo" }] },
          rewardPolicy: { coinsOnCompletion: 0 }
        })
      });
      expect(created.status).toBe(201);
      const occurrenceId = created.body.occurrence.id as string;

      // `done` submits a tap_done proof, which this photo-only mission must reject.
      const done = await request(app, {
        method: "POST",
        url: `/api/mission-occurrences/${occurrenceId}/done`,
        token: parentToken
      });
      expect(done.status).toBe(400);
    });
  });

  // --- coin idempotency ---

  describe("coins", () => {
    it("awards completion coins exactly once and refuses re-completion", async () => {
      const { parentToken, childId } = await setupParentAndChild();
      const created = await request(app, {
        method: "POST",
        url: "/api/mission-templates",
        token: parentToken,
        payload: tapDoneTemplate(childId)
      });
      const occurrenceId = created.body.occurrence.id as string;

      const firstDone = await request(app, {
        method: "POST",
        url: `/api/mission-occurrences/${occurrenceId}/done`,
        token: parentToken
      });
      expect(firstDone.status).toBe(201);

      const balanceAfter = await request(app, {
        method: "GET",
        url: `/api/children/${childId}/coins`,
        token: parentToken
      });
      expect(balanceAfter.status).toBe(200);
      expect(balanceAfter.body.balance).toBe(5);
      expect(balanceAfter.body.ledger).toHaveLength(1);

      // A second completion is refused, and no extra coins are granted.
      const secondDone = await request(app, {
        method: "POST",
        url: `/api/mission-occurrences/${occurrenceId}/done`,
        token: parentToken
      });
      expect(secondDone.status).toBe(400);

      const finalBalance = await request(app, {
        method: "GET",
        url: `/api/children/${childId}/coins`,
        token: parentToken
      });
      expect(finalBalance.body.balance).toBe(5);
      expect(finalBalance.body.ledger).toHaveLength(1);
    });
  });

  // --- chat draft confirm ---

  describe("chat", () => {
    it("creates an action draft from a reminder message and applies it on confirm", async () => {
      const { childToken } = await setupParentAndChild();

      const thread = await request(app, {
        method: "POST",
        url: "/api/chat/threads",
        token: childToken,
        payload: {}
      });
      const threadId = thread.body.id as string;

      const send = await request(app, {
        method: "POST",
        url: `/api/chat/threads/${threadId}/messages`,
        token: childToken,
        payload: { text: "remind me to read a book every day at 08:00" }
      });
      expect(send.status).toBe(201);
      const actionDraftId = send.body.actionDraftId as string;
      expect(typeof actionDraftId).toBe("string");

      const confirm = await request(app, {
        method: "POST",
        url: `/api/chat/action-drafts/${actionDraftId}/confirm`,
        token: childToken
      });
      expect(confirm.status).toBe(201);
      expect(confirm.body.created.template.title).toBe("read a book");

      // The empty-body validation guard still applies to chat messages.
      const empty = await request(app, {
        method: "POST",
        url: `/api/chat/threads/${threadId}/messages`,
        token: childToken,
        payload: { text: "   " }
      });
      expect(empty.status).toBe(400);
    });
  });

  // --- proof file storage ---

  describe("proof storage", () => {
    async function createPhotoOccurrence(parentToken: string, childId: string) {
      const created = await request(app, {
        method: "POST",
        url: "/api/mission-templates",
        token: parentToken,
        payload: photoTemplate(childId)
      });
      expect(created.status).toBe(201);
      return created.body.occurrence.id as string;
    }

    it("uploads a photo, completes the proof, and serves the file back", async () => {
      const { parentToken, childToken, childProfileId } = await setupParentAndChild();
      const occurrenceId = await createPhotoOccurrence(parentToken, childProfileId);

      const upload = await uploadFile(app, {
        url: `/api/mission-occurrences/${occurrenceId}/proofs/uploads`,
        token: childToken,
        buffer: PNG_BYTES,
        filename: "homework.png",
        contentType: "image/png"
      });
      expect(upload.status).toBe(201);
      expect(upload.body.storageKey).toMatch(new RegExp(`^${occurrenceId}/[^/]+\\.png$`));
      expect(upload.body.contentType).toBe("image/png");
      expect(upload.body.sizeBytes).toBe(PNG_BYTES.length);

      const submit = await request(app, {
        method: "POST",
        url: `/api/mission-occurrences/${occurrenceId}/proofs`,
        token: childToken,
        payload: {
          type: "photo",
          payload: {
            storageKey: upload.body.storageKey,
            sizeBytes: upload.body.sizeBytes,
            contentType: upload.body.contentType
          }
        }
      });
      expect(submit.status).toBe(201);
      expect(submit.body.status).toBe("completed");

      const proof = await prisma.proofSubmission.findFirstOrThrow({ where: { occurrenceId } });

      const download = await request(app, {
        method: "GET",
        url: `/api/mission-occurrences/${occurrenceId}/proofs/${proof.id}/file`,
        token: parentToken
      });
      expect(download.status).toBe(200);
      expect(download.raw.headers["content-type"]).toContain("image/png");
      expect(download.raw.rawPayload.equals(PNG_BYTES)).toBe(true);
    });

    it("rejects a non-image upload with 400", async () => {
      const { parentToken, childToken, childProfileId } = await setupParentAndChild();
      const occurrenceId = await createPhotoOccurrence(parentToken, childProfileId);

      const upload = await uploadFile(app, {
        url: `/api/mission-occurrences/${occurrenceId}/proofs/uploads`,
        token: childToken,
        buffer: Buffer.from("not an image"),
        filename: "note.txt",
        contentType: "text/plain"
      });
      expect(upload.status).toBe(400);
    });

    it("forbids another child from downloading a proof file", async () => {
      const { parentToken, childToken, childProfileId } = await setupParentAndChild();
      const other = await pairAdditionalChild(parentToken, "Bo");
      const occurrenceId = await createPhotoOccurrence(parentToken, childProfileId);

      const upload = await uploadFile(app, {
        url: `/api/mission-occurrences/${occurrenceId}/proofs/uploads`,
        token: childToken,
        buffer: PNG_BYTES,
        filename: "homework.png",
        contentType: "image/png"
      });
      await request(app, {
        method: "POST",
        url: `/api/mission-occurrences/${occurrenceId}/proofs`,
        token: childToken,
        payload: {
          type: "photo",
          payload: { storageKey: upload.body.storageKey, sizeBytes: upload.body.sizeBytes }
        }
      });
      const proof = await prisma.proofSubmission.findFirstOrThrow({ where: { occurrenceId } });

      const download = await request(app, {
        method: "GET",
        url: `/api/mission-occurrences/${occurrenceId}/proofs/${proof.id}/file`,
        token: other.childToken
      });
      expect(download.status).toBe(403);
    });
  });
});
