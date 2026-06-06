import { Injectable } from "@nestjs/common";
import { AuthenticatedUser, UserRole } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertParent } from "../../common/rbac";

@Injectable()
export class ChildrenService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    if (user.role === UserRole.Parent) {
      return this.prisma.childProfile.findMany({
        where: { familyId: user.familyId },
        orderBy: { createdAt: "asc" },
        include: { devices: true }
      });
    }

    return this.prisma.childProfile.findMany({
      where: { familyId: user.familyId, id: user.childProfileId },
      include: { devices: true }
    });
  }

  async create(user: AuthenticatedUser, body: { name: string; timezone?: string }) {
    assertParent(user);
    return this.prisma.$transaction(async (tx) => {
      const preset = await tx.agentPersonalityPreset.findFirst({
        where: { familyId: user.familyId, isDefault: true }
      });
      const child = await tx.childProfile.create({
        data: {
          familyId: user.familyId,
          name: body.name,
          timezone: body.timezone ?? "Asia/Jerusalem",
          defaultPersonalityPresetId: preset?.id
        }
      });
      const childUser = await tx.user.create({
        data: {
          familyId: user.familyId,
          role: UserRole.Child,
          name: body.name,
          childProfileId: child.id,
          personalityPresetId: preset?.id
        }
      });
      return { ...child, userId: childUser.id };
    });
  }
}

