import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AuthenticatedUser,
  ChatActionDraftStatus,
  ChatActionType,
  MissionTemplatePayload,
  OpenClawActionDraft,
  OpenClawAllowedAction,
  UserRole
} from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertChildCanAccess } from "../../common/rbac";
import { OpenClawService } from "../openclaw/openclaw.service";
import { MissionsService } from "../missions/missions.service";

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openClaw: OpenClawService,
    private readonly missions: MissionsService
  ) {}

  async listThreads(user: AuthenticatedUser) {
    return this.prisma.chatThread.findMany({
      where:
        user.role === UserRole.Parent
          ? { familyId: user.familyId }
          : { familyId: user.familyId, userId: user.userId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
  }

  async createThread(user: AuthenticatedUser, body: { title?: string; childProfileId?: string }) {
    const childProfileId = user.role === UserRole.Child ? user.childProfileId : body.childProfileId;
    if (childProfileId) {
      assertChildCanAccess(user, childProfileId);
    }

    return this.prisma.chatThread.create({
      data: {
        familyId: user.familyId,
        userId: user.userId,
        childProfileId,
        title: body.title ?? "OpenClaw Chat"
      }
    });
  }

  async listMessages(user: AuthenticatedUser, threadId: string) {
    await this.assertThreadAccess(user, threadId);
    return this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" }
    });
  }

  async sendMessage(user: AuthenticatedUser, threadId: string, text: string) {
    const thread = await this.assertThreadAccess(user, threadId);
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        threadId,
        userId: user.userId,
        sender: "user",
        text
      }
    });

    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    const scheduleContext = await this.buildScheduleContext(user);
    const allowedActions = this.allowedActionsFor(user);
    const response = await this.openClaw.ask({
      userId: user.userId,
      role: user.role,
      childProfileId: user.childProfileId ?? thread.childProfileId ?? undefined,
      personalityPresetId: undefined,
      recentChatSummary: recentMessages
        .reverse()
        .map((message) => `${message.sender}: ${message.text}`)
        .join("\n"),
      messageText: text,
      scheduleContext,
      allowedActions,
      policyLimits: {
        childCanOnlyCreateOwnUnprotectedReminders: true,
        confirmRequiredBeforeMutation: true
      }
    });

    let actionDraftId: string | undefined;
    if (response.actionDraft) {
      actionDraftId = await this.storeActionDraft(user, threadId, response.actionDraft);
    }

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        threadId,
        sender: "openclaw",
        text: response.messageText,
        metadata: {
          actionDraftId,
          snoozeDecision: response.snoozeDecision,
          safetyFlags: response.safetyFlags
        } as Prisma.InputJsonObject
      }
    });

    await this.prisma.agentAuditLog.create({
      data: {
        familyId: user.familyId,
        userId: user.userId,
        threadId,
        allowedActions,
        contextSummary: "Chat message processed through OpenClaw adapter",
        response: response as unknown as Prisma.InputJsonObject,
        decisionResult: actionDraftId ? "draft_created" : "message_only"
      }
    });

    return { userMessage, assistantMessage, actionDraftId };
  }

  async confirmDraft(user: AuthenticatedUser, draftId: string) {
    const draft = await this.findDraftForUser(user, draftId);
    if (draft.status !== ChatActionDraftStatus.Drafted) {
      throw new BadRequestException("Draft is not confirmable");
    }
    if (draft.expiresAt.getTime() < Date.now()) {
      await this.prisma.chatActionDraft.update({
        where: { id: draftId },
        data: { status: ChatActionDraftStatus.Expired }
      });
      throw new BadRequestException("Draft expired");
    }

    if (draft.type !== ChatActionType.CreateMissionTemplate) {
      throw new BadRequestException("Only create mission drafts are supported in V1");
    }

    const created = await this.missions.createTemplate(user, draft.payload as unknown as MissionTemplatePayload);
    await this.prisma.chatActionDraft.update({
      where: { id: draftId },
      data: { status: ChatActionDraftStatus.Confirmed }
    });
    return { draftId, created };
  }

  async rejectDraft(user: AuthenticatedUser, draftId: string) {
    await this.findDraftForUser(user, draftId);
    return this.prisma.chatActionDraft.update({
      where: { id: draftId },
      data: { status: ChatActionDraftStatus.Rejected }
    });
  }

  private async assertThreadAccess(user: AuthenticatedUser, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, familyId: user.familyId }
    });
    if (!thread) {
      throw new NotFoundException("Chat thread not found");
    }
    if (user.role === UserRole.Child && thread.userId !== user.userId) {
      throw new ForbiddenException("Child can access only their own chat threads");
    }
    return thread;
  }

  private async findDraftForUser(user: AuthenticatedUser, draftId: string) {
    const draft = await this.prisma.chatActionDraft.findFirst({
      where: { id: draftId },
      include: { thread: true }
    });
    if (!draft || draft.thread.familyId !== user.familyId) {
      throw new NotFoundException("Action draft not found");
    }
    if (user.role === UserRole.Child && draft.userId !== user.userId) {
      throw new ForbiddenException("Child can access only their own drafts");
    }
    return draft;
  }

  private allowedActionsFor(user: AuthenticatedUser): OpenClawAllowedAction[] {
    const actions: OpenClawAllowedAction[] = ["answer_general_chat", "draft_schedule_change", "write_child_message"];
    if (user.role === UserRole.Child) {
      actions.push("recommend_snooze");
    }
    return actions;
  }

  private async buildScheduleContext(user: AuthenticatedUser) {
    const where =
      user.role === UserRole.Parent
        ? { familyId: user.familyId }
        : { familyId: user.familyId, childProfileId: user.childProfileId };
    const upcoming = await this.prisma.missionOccurrence.findMany({
      where,
      orderBy: { scheduledFor: "asc" },
      take: 10,
      include: { template: true }
    });
    return {
      upcoming: upcoming.map((occurrence) => ({
        id: occurrence.id,
        title: occurrence.template.title,
        scheduledFor: occurrence.scheduledFor.toISOString(),
        status: occurrence.status
      }))
    };
  }

  private async storeActionDraft(user: AuthenticatedUser, threadId: string, draft: OpenClawActionDraft) {
    const validationErrors = this.validateDraft(user, draft);
    const status =
      validationErrors.length === 0 ? ChatActionDraftStatus.Drafted : ChatActionDraftStatus.Invalid;
    const saved = await this.prisma.chatActionDraft.create({
      data: {
        threadId,
        userId: user.userId,
        type: draft.type,
        status,
        payload: draft.payload as Prisma.InputJsonObject,
        validationErrors,
        expiresAt: new Date(Date.now() + 10 * 60_000)
      }
    });
    return status === ChatActionDraftStatus.Drafted ? saved.id : undefined;
  }

  private validateDraft(user: AuthenticatedUser, draft: OpenClawActionDraft) {
    const errors: string[] = [];
    if (draft.type !== ChatActionType.CreateMissionTemplate) {
      errors.push("Unsupported action type in V1");
      return errors;
    }

    const payload = draft.payload as Partial<MissionTemplatePayload>;
    if (!payload.title) errors.push("Missing title");
    if (!payload.scheduledTime) errors.push("Missing scheduled time");
    if (!payload.childProfileId && user.role === UserRole.Child) {
      payload.childProfileId = user.childProfileId;
    }
    if (!payload.childProfileId) errors.push("Missing child profile");

    if (user.role === UserRole.Child) {
      if (payload.childProfileId !== user.childProfileId) {
        errors.push("Child can create reminders only for self");
      }
      if (payload.protected) {
        errors.push("Child cannot create protected missions");
      }
      payload.protected = false;
    }

    return errors;
  }
}

