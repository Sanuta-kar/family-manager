import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@family-manager/shared";
import { DevicesService } from "./devices.service";

function buildService() {
  const child = {
    id: "child-1",
    familyId: "fam-1",
    name: "Ada",
    user: { id: "user-1" }
  };

  const tx = {
    device: { create: vi.fn().mockResolvedValue({ id: "device-1" }) },
    devicePairingCode: { update: vi.fn().mockResolvedValue({}) }
  };

  const prisma = {
    devicePairingCode: {
      findUnique: vi.fn().mockResolvedValue({
        id: "code-1",
        familyId: "fam-1",
        childProfileId: "child-1",
        claimedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      })
    },
    childProfile: { findFirst: vi.fn().mockResolvedValue(child) },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx))
  };

  const authService = {
    issueTokenPair: vi.fn().mockReturnValue({
      accessToken: "access",
      refreshToken: "refresh",
      user: { userId: "user-1", role: UserRole.Child, childProfileId: "child-1" }
    })
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new DevicesService(prisma as any, authService as any);
  return { service, prisma, authService };
}

describe("DevicesService.claim", () => {
  it("returns childProfileId and childDisplayName alongside the token pair", async () => {
    const { service } = buildService();

    const result = await service.claim({
      code: "ABC123",
      deviceName: "Pixel",
      platform: "android"
    });

    expect(result.accessToken).toBe("access");
    expect(result.refreshToken).toBe("refresh");
    expect(result.childProfileId).toBe("child-1");
    expect(result.childDisplayName).toBe("Ada");
  });
});
