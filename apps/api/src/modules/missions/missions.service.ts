import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuthenticatedUser,
  MissionStatus,
  MissionTemplatePayload,
  ProofPolicy,
  ProofRuleType,
  RewardPolicy,
  SnoozePolicy,
  UserRole
} from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertChildCanAccess, assertParent } from "../../common/rbac";
import { CoinsService } from "../coins/coins.service";
import { AlertsService } from "../alerts/alerts.service";

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly alerts: AlertsService
  ) {}

  async createTemplate(user: AuthenticatedUser, body: MissionTemplatePayload) {
    this.assertCanWriteTemplate(user, body.childProfileId, body.protected);

    const template = await this.prisma.missionTemplate.create({
      data: {
        familyId: user.familyId,
        childProfileId: body.childProfileId,
        ownerUserId: user.userId,
        title: body.title,
        scheduledTime: body.scheduledTime,
        recurrenceRule: body.recurrenceRule,
        isProtected: body.protected,
        proofPolicy: body.proofPolicy,
        snoozePolicy: body.snoozePolicy,
        rewardPolicy: body.rewardPolicy
      }
    });

    const occurrence = await this.createNextOccurrence(template.id, user.familyId, body.childProfileId, body.scheduledTime);
    return { template, occurrence };
  }

  async updateTemplate(user: AuthenticatedUser, id: string, body: Partial<MissionTemplatePayload>) {
    const template = await this.prisma.missionTemplate.findFirst({ where: { id, familyId: user.familyId } });
    if (!template) {
      throw new NotFoundException("Mission template not found");
    }
    this.assertCanModifyExistingTemplate(user, template);

    return this.prisma.missionTemplate.update({
      where: { id },
      data: {
        title: body.title,
        scheduledTime: body.scheduledTime,
        recurrenceRule: body.recurrenceRule,
        isProtected: body.protected,
        proofPolicy: body.proofPolicy,
        snoozePolicy: body.snoozePolicy,
        rewardPolicy: body.rewardPolicy
      }
    });
  }

  async today(user: AuthenticatedUser, childProfileId: string, date?: string) {
    assertChildCanAccess(user, childProfileId);
    const day = date ? new Date(date) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.prisma.missionOccurrence.findMany({
      where: {
        familyId: user.familyId,
        childProfileId,
        scheduledFor: { gte: start, lt: end },
        status: { not: MissionStatus.Cancelled }
      },
      orderBy: { scheduledFor: "asc" },
      include: {
        template: true,
        snoozes: true,
        proofs: true
      }
    });
  }

  async snooze(user: AuthenticatedUser, id: string, body: { requestedMinutes: number; source?: string }) {
    const occurrence = await this.findOccurrenceForUser(user, id);
    const policy = occurrence.template.snoozePolicy as SnoozePolicy;
    if (!policy.allowed) {
      return this.recordDeniedSnooze(id, body.requestedMinutes, "Snooze is disabled for this mission");
    }

    const snoozeCount = await this.prisma.snoozeEvent.count({ where: { occurrenceId: id, decision: "approved" } });
    if (snoozeCount >= policy.maxSnoozes) {
      await this.alerts.createMissionAlert({
        familyId: occurrence.familyId,
        childProfileId: occurrence.childProfileId,
        occurrenceId: occurrence.id,
        title: "Snooze limit reached",
        message: `${occurrence.template.title} was not completed after all snoozes.`
      });
      return this.recordDeniedSnooze(id, body.requestedMinutes, "Snooze limit reached");
    }

    if (!policy.allowedMinutes.includes(body.requestedMinutes)) {
      return this.recordDeniedSnooze(id, body.requestedMinutes, "Requested snooze duration is not allowed");
    }

    const deadline = new Date(Date.now() + body.requestedMinutes * 60_000);
    await this.prisma.$transaction([
      this.prisma.snoozeEvent.create({
        data: {
          occurrenceId: id,
          requestedMinutes: body.requestedMinutes,
          approvedMinutes: body.requestedMinutes,
          source: body.source ?? "child",
          decision: "approved"
        }
      }),
      this.prisma.missionOccurrence.update({
        where: { id },
        data: { status: MissionStatus.Snoozed, currentDeadlineAt: deadline }
      })
    ]);

    return { decision: "approved", approvedMinutes: body.requestedMinutes, nextAlarmAt: deadline };
  }

  async done(user: AuthenticatedUser, id: string) {
    await this.submitProof(user, id, { type: ProofRuleType.TapDone, payload: { tappedAt: new Date().toISOString() } });
    return this.evaluateAndPersist(id);
  }

  async submitProof(
    user: AuthenticatedUser,
    id: string,
    body: { type: string; payload: Record<string, unknown>; confidence?: number }
  ) {
    const occurrence = await this.findOccurrenceForUser(user, id);
    if ([MissionStatus.Completed, MissionStatus.Failed, MissionStatus.Cancelled].includes(occurrence.status as MissionStatus)) {
      throw new BadRequestException("Mission is already closed");
    }

    await this.prisma.proofSubmission.create({
      data: {
        occurrenceId: id,
        type: body.type,
        payload: body.payload,
        confidence: body.confidence
      }
    });

    return this.evaluateAndPersist(id);
  }

  async parentReview(user: AuthenticatedUser, id: string, body: { action: "approve" | "reject"; note?: string }) {
    assertParent(user);
    const occurrence = await this.prisma.missionOccurrence.findFirst({
      where: { id, familyId: user.familyId },
      include: { template: true }
    });
    if (!occurrence) {
      throw new NotFoundException("Mission occurrence not found");
    }

    if (body.action === "approve") {
      const completed = await this.prisma.missionOccurrence.update({
        where: { id },
        data: { status: MissionStatus.Completed, completedAt: new Date() }
      });
      await this.awardCoinsOnce(completed.id);
      return completed;
    }

    return this.prisma.missionOccurrence.update({
      where: { id },
      data: { status: MissionStatus.Failed, failedAt: new Date() }
    });
  }

  async createMissedAlert(occurrenceId: string) {
    const occurrence = await this.prisma.missionOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { template: true }
    });
    if (!occurrence) {
      return undefined;
    }
    return this.alerts.createMissionAlert({
      familyId: occurrence.familyId,
      childProfileId: occurrence.childProfileId,
      occurrenceId: occurrence.id,
      title: "Mission missed",
      message: `${occurrence.template.title} was not completed by the deadline.`
    });
  }

  private assertCanWriteTemplate(user: AuthenticatedUser, childProfileId: string, isProtected: boolean) {
    if (user.role === UserRole.Parent) {
      return;
    }
    if (isProtected) {
      throw new ForbiddenException("Children cannot create protected missions");
    }
    assertChildCanAccess(user, childProfileId);
  }

  private assertCanModifyExistingTemplate(user: AuthenticatedUser, template: { childProfileId: string; ownerUserId: string; isProtected: boolean }) {
    if (user.role === UserRole.Parent) {
      return;
    }
    if (template.isProtected || template.ownerUserId !== user.userId || template.childProfileId !== user.childProfileId) {
      throw new ForbiddenException("Children can modify only their own unprotected reminders");
    }
  }

  private async createNextOccurrence(templateId: string, familyId: string, childProfileId: string, scheduledTime: string) {
    const scheduledFor = this.nextScheduledDate(scheduledTime);
    return this.prisma.missionOccurrence.create({
      data: {
        familyId,
        templateId,
        childProfileId,
        scheduledFor,
        status: MissionStatus.Scheduled
      }
    });
  }

  private nextScheduledDate(time: string) {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    if (date.getTime() < Date.now()) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  }

  private async findOccurrenceForUser(user: AuthenticatedUser, id: string) {
    const occurrence = await this.prisma.missionOccurrence.findFirst({
      where: { id, familyId: user.familyId },
      include: { template: true, proofs: true, snoozes: true }
    });
    if (!occurrence) {
      throw new NotFoundException("Mission occurrence not found");
    }
    assertChildCanAccess(user, occurrence.childProfileId);
    return occurrence;
  }

  private async recordDeniedSnooze(occurrenceId: string, requestedMinutes: number, reason: string) {
    await this.prisma.snoozeEvent.create({
      data: {
        occurrenceId,
        requestedMinutes,
        source: "backend",
        decision: "denied",
        reason
      }
    });
    return { decision: "denied", reason };
  }

  private async evaluateAndPersist(occurrenceId: string) {
    const occurrence = await this.prisma.missionOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
      include: { template: true, proofs: true }
    });
    const policy = occurrence.template.proofPolicy as ProofPolicy;
    const submittedTypes = new Set(occurrence.proofs.map((proof) => proof.type));
    const requiredTypes = policy.rules.map((rule) => rule.type);
    const passed =
      policy.mode === "any"
        ? requiredTypes.some((type) => submittedTypes.has(type))
        : requiredTypes.every((type) => submittedTypes.has(type));

    if (passed) {
      const completed = await this.prisma.missionOccurrence.update({
        where: { id: occurrenceId },
        data: { status: MissionStatus.Completed, completedAt: new Date() }
      });
      await this.awardCoinsOnce(occurrenceId);
      return completed;
    }

    const hasTapDone = submittedTypes.has(ProofRuleType.TapDone);
    if (hasTapDone) {
      return this.prisma.missionOccurrence.update({
        where: { id: occurrenceId },
        data: { status: MissionStatus.ParentReview }
      });
    }

    return this.prisma.missionOccurrence.update({
      where: { id: occurrenceId },
      data: { status: MissionStatus.ProofPending }
    });
  }

  private async awardCoinsOnce(occurrenceId: string) {
    const existingAward = await this.prisma.coinLedger.findFirst({ where: { occurrenceId } });
    if (existingAward) {
      return;
    }
    const occurrence = await this.prisma.missionOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
      include: { template: true }
    });
    const reward = occurrence.template.rewardPolicy as RewardPolicy;
    await this.coins.awardCompletionCoins({
      familyId: occurrence.familyId,
      childProfileId: occurrence.childProfileId,
      occurrenceId,
      amount: reward.coinsOnCompletion,
      reason: `Completed mission: ${occurrence.template.title}`
    });
  }
}

