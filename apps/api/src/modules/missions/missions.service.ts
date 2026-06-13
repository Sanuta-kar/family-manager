import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AuthenticatedUser,
  MissionStatus,
  MissionTemplatePayload,
  ProofPolicy,
  ProofRuleType,
  RewardPolicy,
  SnoozePolicy,
  UserRole,
  nextScheduledDateForTimezone
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
    const child = await this.prisma.childProfile.findFirst({
      where: { id: body.childProfileId, familyId: user.familyId },
      select: { id: true, timezone: true }
    });
    if (!child) {
      throw new NotFoundException("Child profile not found");
    }

    const template = await this.prisma.missionTemplate.create({
      data: {
        familyId: user.familyId,
        childProfileId: child.id,
        ownerUserId: user.userId,
        title: body.title,
        scheduledTime: body.scheduledTime,
        recurrenceRule: body.recurrenceRule,
        isProtected: body.protected,
        proofPolicy: body.proofPolicy as Prisma.InputJsonObject,
        snoozePolicy: body.snoozePolicy as Prisma.InputJsonObject,
        rewardPolicy: body.rewardPolicy as Prisma.InputJsonObject
      }
    });

    const occurrence = await this.createNextOccurrence(template.id, user.familyId, child.id, body.scheduledTime, child.timezone);
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
        proofPolicy: body.proofPolicy as Prisma.InputJsonObject | undefined,
        snoozePolicy: body.snoozePolicy as Prisma.InputJsonObject | undefined,
        rewardPolicy: body.rewardPolicy as Prisma.InputJsonObject | undefined
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
    if (![MissionStatus.Notified, MissionStatus.Snoozed].includes(occurrence.status as MissionStatus)) {
      throw new BadRequestException("Mission can be snoozed only after it has notified");
    }

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
    if (policy.hardDeadlineMinutes) {
      const hardDeadline = new Date(occurrence.scheduledFor.getTime() + policy.hardDeadlineMinutes * 60_000);
      if (deadline.getTime() > hardDeadline.getTime()) {
        return this.recordDeniedSnooze(id, body.requestedMinutes, "Requested snooze exceeds the hard deadline");
      }
    }

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
    this.validateProofSubmission(occurrence, body);

    await this.prisma.proofSubmission.create({
      data: {
        occurrenceId: id,
        type: body.type,
        payload: body.payload as Prisma.InputJsonObject,
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

  private async createNextOccurrence(
    templateId: string,
    familyId: string,
    childProfileId: string,
    scheduledTime: string,
    timezone: string
  ) {
    let scheduledFor: Date;
    try {
      scheduledFor = nextScheduledDateForTimezone(scheduledTime, timezone);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid mission schedule");
    }
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

  private validateProofSubmission(
    occurrence: { template: { proofPolicy: unknown } },
    body: { type: string; payload: Record<string, unknown>; confidence?: number }
  ) {
    const policy = occurrence.template.proofPolicy as ProofPolicy;
    const rule = policy.rules.find((candidate) => candidate.type === body.type);
    if (!rule) {
      throw new BadRequestException("Proof type is not accepted for this mission");
    }

    if (body.type === ProofRuleType.ParentReview) {
      throw new BadRequestException("Parent review proof can be completed only through parent review");
    }

    if (body.type === ProofRuleType.TapDone) {
      const tappedAt = this.readString(body.payload, "tappedAt");
      if (!tappedAt || Number.isNaN(Date.parse(tappedAt))) {
        throw new BadRequestException("Tap-done proof must include a valid tappedAt timestamp");
      }
      return;
    }

    if (body.type === ProofRuleType.Photo) {
      const storageKey = this.readString(body.payload, "storageKey");
      if (!storageKey) {
        throw new BadRequestException("Photo proof must reference a stored upload");
      }
      const sizeBytes = this.readNumber(body.payload, "sizeBytes");
      if (sizeBytes !== undefined && sizeBytes <= 0) {
        throw new BadRequestException("Photo proof size must be positive");
      }
      return;
    }

    if (body.type === ProofRuleType.GeofenceExit) {
      const latitude = this.readNumber(body.payload, "latitude") ?? this.readNumber(body.payload, "lat");
      const longitude =
        this.readNumber(body.payload, "longitude") ??
        this.readNumber(body.payload, "lng") ??
        this.readNumber(body.payload, "lon");
      if (latitude === undefined || longitude === undefined) {
        throw new BadRequestException("Geofence proof must include latitude and longitude");
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new BadRequestException("Geofence proof coordinates are out of range");
      }

      const config = rule.config ?? {};
      const targetLatitude = this.readNumber(config, "latitude") ?? this.readNumber(config, "lat");
      const targetLongitude =
        this.readNumber(config, "longitude") ??
        this.readNumber(config, "lng") ??
        this.readNumber(config, "lon");
      const radiusMeters = this.readNumber(config, "radiusMeters") ?? this.readNumber(config, "radius");
      if (targetLatitude !== undefined && targetLongitude !== undefined && radiusMeters !== undefined) {
        const accuracyMeters = Math.max(0, this.readNumber(body.payload, "accuracyMeters") ?? 0);
        const distance = this.distanceMeters(latitude, longitude, targetLatitude, targetLongitude);
        if (distance > radiusMeters + accuracyMeters) {
          throw new BadRequestException("Geofence proof is outside the allowed area");
        }
      }
      return;
    }

    throw new BadRequestException("Unsupported proof type");
  }

  private readString(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private readNumber(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
    const earthRadiusMeters = 6_371_000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLatitude = toRadians(latitudeB - latitudeA);
    const deltaLongitude = toRadians(longitudeB - longitudeA);
    const a =
      Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
      Math.cos(toRadians(latitudeA)) *
        Math.cos(toRadians(latitudeB)) *
        Math.sin(deltaLongitude / 2) *
        Math.sin(deltaLongitude / 2);
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
