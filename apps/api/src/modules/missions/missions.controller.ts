import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  AuthenticatedUser,
  MissionTemplatePayload,
  MissionTemplatePayloadSchema,
  ParentReviewInput,
  ParentReviewInputSchema,
  SnoozeInput,
  SnoozeInputSchema,
  SubmitProofInput,
  SubmitProofInputSchema,
  TodayQuery,
  TodayQuerySchema,
  UpdateMissionTemplateInput,
  UpdateMissionTemplateInputSchema
} from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { MissionsService } from "./missions.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post("mission-templates")
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(MissionTemplatePayloadSchema)) body: MissionTemplatePayload
  ) {
    return this.missionsService.createTemplate(user, body);
  }

  @Patch("mission-templates/:id")
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateMissionTemplateInputSchema)) body: UpdateMissionTemplateInput
  ) {
    return this.missionsService.updateTemplate(user, id, body);
  }

  @Get("children/:childId/missions/today")
  today(
    @CurrentUser() user: AuthenticatedUser,
    @Param("childId") childId: string,
    @Query(new ZodValidationPipe(TodayQuerySchema)) query: TodayQuery
  ) {
    return this.missionsService.today(user, childId, query.date);
  }

  @Post("mission-occurrences/:id/snooze")
  snooze(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SnoozeInputSchema)) body: SnoozeInput
  ) {
    return this.missionsService.snooze(user, id, body);
  }

  @Post("mission-occurrences/:id/done")
  done(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.missionsService.done(user, id);
  }

  @Post("mission-occurrences/:id/proofs")
  proof(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmitProofInputSchema)) body: SubmitProofInput
  ) {
    return this.missionsService.submitProof(user, id, body);
  }

  @Post("mission-occurrences/:id/parent-review")
  parentReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ParentReviewInputSchema)) body: ParentReviewInput
  ) {
    return this.missionsService.parentReview(user, id, body);
  }
}
