import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AlertStatus, AuthenticatedUser } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertParent } from "../../common/rbac";

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    assertParent(user);
    return this.prisma.alert.findMany({
      where: { familyId: user.familyId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async update(user: AuthenticatedUser, id: string, status: string) {
    assertParent(user);
    if (!Object.values(AlertStatus).includes(status as AlertStatus)) {
      throw new BadRequestException("Invalid alert status");
    }
    const alert = await this.prisma.alert.findFirst({
      where: { id, familyId: user.familyId },
      select: { id: true }
    });
    if (!alert) {
      throw new NotFoundException("Alert not found");
    }

    return this.prisma.alert.update({
      where: { id: alert.id },
      data: {
        status: status as AlertStatus,
        resolvedAt: status === AlertStatus.Resolved ? new Date() : undefined
      }
    });
  }

  async createMissionAlert(input: {
    familyId: string;
    childProfileId?: string;
    occurrenceId?: string;
    title: string;
    message: string;
  }) {
    return this.prisma.alert.create({
      data: {
        familyId: input.familyId,
        childProfileId: input.childProfileId,
        occurrenceId: input.occurrenceId,
        title: input.title,
        message: input.message
      }
    });
  }
}
