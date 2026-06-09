import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { AuthenticatedUser, UserRole } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertParent } from "../../common/rbac";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async createPairingCode(user: AuthenticatedUser, body: { childProfileId: string; expiresInMinutes?: number }) {
    assertParent(user);
    const child = await this.prisma.childProfile.findFirst({
      where: { id: body.childProfileId, familyId: user.familyId }
    });
    if (!child) {
      throw new NotFoundException("Child profile not found");
    }

    const code = randomBytes(5).toString("hex").toUpperCase();
    await this.prisma.devicePairingCode.create({
      data: {
        familyId: user.familyId,
        childProfileId: child.id,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + (body.expiresInMinutes ?? 15) * 60_000)
      }
    });

    return { code, childProfileId: child.id, expiresAtMinutes: body.expiresInMinutes ?? 15 };
  }

  async claim(body: { code: string; deviceName: string; platform: string; fcmToken?: string }) {
    const code = await this.prisma.devicePairingCode.findUnique({
      where: { codeHash: this.hashCode(body.code.trim().toUpperCase()) }
    });
    if (!code || code.claimedAt || code.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invalid or expired pairing code");
    }

    const child = await this.prisma.childProfile.findFirst({
      where: { id: code.childProfileId, familyId: code.familyId },
      include: { user: true }
    });
    if (!child?.user) {
      throw new BadRequestException("Child user is not ready");
    }

    const childUser = child.user;
    const result = await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          familyId: code.familyId,
          childProfileId: code.childProfileId,
          name: body.deviceName,
          platform: body.platform,
          fcmToken: body.fcmToken
        }
      });
      await tx.devicePairingCode.update({
        where: { id: code.id },
        data: { claimedAt: new Date() }
      });
      return { child, device };
    });

    return this.authService.issueTokenPair({
      userId: childUser.id,
      familyId: result.child.familyId,
      role: UserRole.Child,
      childProfileId: result.child.id,
      deviceId: result.device.id
    });
  }

  async registerFcmToken(user: AuthenticatedUser, fcmToken: string) {
    if (!user.deviceId) {
      throw new BadRequestException("Device token can be registered only by paired child devices");
    }

    return this.prisma.device.update({
      where: { id: user.deviceId },
      data: { fcmToken, lastSeenAt: new Date() }
    });
  }

  private hashCode(code: string) {
    return createHash("sha256").update(code).digest("hex");
  }
}

