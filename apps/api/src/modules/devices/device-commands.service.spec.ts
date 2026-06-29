import { describe, expect, it, vi } from "vitest";
import {
  AuthenticatedUser,
  DeviceCapabilityKind,
  DeviceCommandResultStatus,
  DeviceCommandStatus,
  UserRole
} from "@family-manager/shared";
import { DeviceCommandsService } from "./device-commands.service";

const childUser: AuthenticatedUser = {
  userId: "user-1",
  familyId: "fam-1",
  role: UserRole.Child,
  childProfileId: "child-1",
  deviceId: "device-1"
};

function buildPrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    deviceCommand: {
      create: vi.fn().mockResolvedValue({ id: "cmd-1", capabilityType: "calendar", familyId: "fam-1" }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    deviceCommandResult: { create: vi.fn().mockResolvedValue({ id: "res-1" }) },
    deviceCapabilityGrant: { findUnique: vi.fn().mockResolvedValue(null) },
    agentAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
    ...overrides
  };
  return prisma;
}

describe("DeviceCommandsService.createFromReadContextDraft", () => {
  it("creates a pending command for the child's device", async () => {
    const prisma = buildPrisma();
    const service = new DeviceCommandsService(prisma);

    await service.createFromReadContextDraft(childUser, {
      payload: { kind: "calendar", range: "today" },
      originDraftId: "draft-1"
    });

    expect(prisma.deviceCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviceId: "device-1",
          childProfileId: "child-1",
          capabilityType: DeviceCapabilityKind.Calendar,
          status: DeviceCommandStatus.Pending,
          confirmedBy: "user-1",
          originDraftId: "draft-1"
        })
      })
    );
  });

  it("rejects an unknown capability kind", async () => {
    const service = new DeviceCommandsService(buildPrisma());
    await expect(
      service.createFromReadContextDraft(childUser, { payload: { kind: "contacts" }, originDraftId: "d" })
    ).rejects.toThrow();
  });

  it("refuses when a parent has disabled the capability for the device", async () => {
    const prisma = buildPrisma({
      deviceCapabilityGrant: {
        findUnique: vi.fn().mockResolvedValue({ enabled: false })
      }
    });
    const service = new DeviceCommandsService(prisma);
    await expect(
      service.createFromReadContextDraft(childUser, { payload: { kind: "calendar" }, originDraftId: "d" })
    ).rejects.toThrow();
    expect(prisma.deviceCommand.create).not.toHaveBeenCalled();
  });

  it("requires a paired device on the token", async () => {
    const service = new DeviceCommandsService(buildPrisma());
    await expect(
      service.createFromReadContextDraft(
        { ...childUser, deviceId: undefined },
        { payload: { kind: "calendar" }, originDraftId: "d" }
      )
    ).rejects.toThrow();
  });
});

describe("DeviceCommandsService.listPendingForDevice", () => {
  it("returns the device's open commands and marks pending ones dispatched", async () => {
    const prisma = buildPrisma({
      deviceCommand: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cmd-1", status: DeviceCommandStatus.Pending },
          { id: "cmd-2", status: DeviceCommandStatus.Dispatched }
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    });
    const service = new DeviceCommandsService(prisma);

    const commands = await service.listPendingForDevice(childUser);

    expect(commands).toHaveLength(2);
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["cmd-1"] } }) })
    );
  });
});

describe("DeviceCommandsService.submitResult", () => {
  it("stores the result, completes the command, and audits", async () => {
    const prisma = buildPrisma({
      deviceCommand: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cmd-1",
          deviceId: "device-1",
          familyId: "fam-1",
          capabilityType: "calendar",
          result: null
        }),
        update: vi.fn().mockResolvedValue({})
      }
    });
    const service = new DeviceCommandsService(prisma);

    await service.submitResult(childUser, "cmd-1", {
      status: DeviceCommandResultStatus.Completed,
      payload: { events: [] }
    });

    expect(prisma.deviceCommandResult.create).toHaveBeenCalled();
    expect(prisma.deviceCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: DeviceCommandStatus.Completed }) })
    );
    expect(prisma.agentAuditLog.create).toHaveBeenCalled();
  });

  it("is idempotent when a result already exists", async () => {
    const prisma = buildPrisma({
      deviceCommand: {
        findFirst: vi.fn().mockResolvedValue({
          id: "cmd-1",
          deviceId: "device-1",
          familyId: "fam-1",
          result: { id: "res-1", status: "completed" }
        })
      }
    });
    const service = new DeviceCommandsService(prisma);

    const result = await service.submitResult(childUser, "cmd-1", {
      status: DeviceCommandResultStatus.Completed
    });

    expect(result.idempotent).toBe(true);
    expect(prisma.deviceCommandResult.create).not.toHaveBeenCalled();
  });
});
