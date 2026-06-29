import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AuthenticatedUser,
  DEVICE_CAPABILITY_POLICY,
  DeviceCapabilityKind,
  DeviceCommandResultInput,
  DeviceCommandResultStatus,
  DeviceCommandStatus,
  ReadDeviceContextPayloadSchema,
  UserRole
} from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertParent } from "../../common/rbac";

/** Commands expire if the device never picks them up. */
const COMMAND_TTL_MS = 10 * 60_000;

const OPEN_STATUSES = [DeviceCommandStatus.Pending, DeviceCommandStatus.Dispatched];

@Injectable()
export class DeviceCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a device command from a confirmed/auto-approved `read_device_context` draft.
   * The command targets the requesting child's own device (the on-device agent).
   */
  async createFromReadContextDraft(
    user: AuthenticatedUser,
    input: { payload: unknown; originDraftId?: string }
  ) {
    if (!user.deviceId || !user.childProfileId) {
      throw new BadRequestException("Device context can be requested only from a paired child device");
    }

    const payload = ReadDeviceContextPayloadSchema.parse(input.payload);
    const policy = DEVICE_CAPABILITY_POLICY[payload.kind];
    if (!policy.allowedRoles.includes(user.role)) {
      throw new ForbiddenException("This role cannot request that device capability");
    }

    await this.assertCapabilityEnabled(user.deviceId, payload.kind);

    return this.prisma.deviceCommand.create({
      data: {
        deviceId: user.deviceId,
        familyId: user.familyId,
        childProfileId: user.childProfileId,
        capabilityType: payload.kind,
        params: payload as Prisma.InputJsonObject,
        status: DeviceCommandStatus.Pending,
        requiresConfirmation: !policy.readOnly,
        confirmedBy: user.userId,
        originDraftId: input.originDraftId,
        expiresAt: new Date(Date.now() + COMMAND_TTL_MS)
      }
    });
  }

  /** Device pull: returns the device's open, unexpired commands and marks pending ones dispatched. */
  async listPendingForDevice(user: AuthenticatedUser) {
    const deviceId = this.requireDevice(user);
    const now = new Date();

    await this.prisma.deviceCommand.updateMany({
      where: { deviceId, status: { in: OPEN_STATUSES }, expiresAt: { lte: now } },
      data: { status: DeviceCommandStatus.Expired }
    });

    const commands = await this.prisma.deviceCommand.findMany({
      where: { deviceId, status: { in: OPEN_STATUSES }, expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" }
    });

    const pendingIds = commands.filter((c) => c.status === DeviceCommandStatus.Pending).map((c) => c.id);
    if (pendingIds.length > 0) {
      await this.prisma.deviceCommand.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: DeviceCommandStatus.Dispatched, dispatchedAt: now }
      });
    }

    return commands.map((c) =>
      c.status === DeviceCommandStatus.Pending
        ? { ...c, status: DeviceCommandStatus.Dispatched, dispatchedAt: now }
        : c
    );
  }

  /** Device result post: idempotent by command, stores result, updates status, audits. */
  async submitResult(user: AuthenticatedUser, commandId: string, input: DeviceCommandResultInput) {
    const deviceId = this.requireDevice(user);
    const command = await this.prisma.deviceCommand.findFirst({
      where: { id: commandId, deviceId },
      include: { result: true }
    });
    if (!command) {
      throw new NotFoundException("Device command not found");
    }
    if (command.result) {
      return { command, result: command.result, idempotent: true as const };
    }

    const commandStatus =
      input.status === DeviceCommandResultStatus.Completed
        ? DeviceCommandStatus.Completed
        : DeviceCommandStatus.Failed;

    try {
      const [result] = await this.prisma.$transaction([
        this.prisma.deviceCommandResult.create({
          data: {
            commandId,
            status: input.status,
            payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
            error: input.error
          }
        }),
        this.prisma.deviceCommand.update({ where: { id: commandId }, data: { status: commandStatus } }),
        this.prisma.agentAuditLog.create({
          data: {
            familyId: command.familyId,
            userId: user.userId,
            allowedActions: ["read_device_context"],
            contextSummary: `Device command ${command.capabilityType} reported ${input.status}`,
            response: input as unknown as Prisma.InputJsonObject,
            decisionResult: input.status
          }
        })
      ]);
      return { command, result, idempotent: false as const };
    } catch (error) {
      // Concurrent double-post: the unique commandId constraint makes results idempotent.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.deviceCommandResult.findUnique({ where: { commandId } });
        return { command, result: existing, idempotent: true as const };
      }
      throw error;
    }
  }

  /** Parent enables/disables a capability for a specific device in their family. */
  async setCapabilityGrant(
    user: AuthenticatedUser,
    deviceId: string,
    capabilityType: DeviceCapabilityKind,
    enabled: boolean
  ) {
    assertParent(user);
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, familyId: user.familyId } });
    if (!device) {
      throw new NotFoundException("Device not found");
    }
    return this.prisma.deviceCapabilityGrant.upsert({
      where: { deviceId_capabilityType: { deviceId, capabilityType } },
      create: { deviceId, capabilityType, enabled },
      update: { enabled }
    });
  }

  private async assertCapabilityEnabled(deviceId: string, capabilityType: DeviceCapabilityKind) {
    const grant = await this.prisma.deviceCapabilityGrant.findUnique({
      where: { deviceId_capabilityType: { deviceId, capabilityType } }
    });
    if (grant && !grant.enabled) {
      throw new ForbiddenException("This capability is disabled for the device");
    }
  }

  private requireDevice(user: AuthenticatedUser): string {
    if (!user.deviceId) {
      throw new ForbiddenException("Only a paired device can access its command queue");
    }
    return user.deviceId;
  }
}
