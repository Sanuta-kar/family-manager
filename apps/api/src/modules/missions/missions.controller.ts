import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, MissionTemplatePayload } from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { MissionsService } from "./missions.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post("mission-templates")
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() body: MissionTemplatePayload) {
    return this.missionsService.createTemplate(user, body);
  }

  @Patch("mission-templates/:id")
  updateTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: Partial<MissionTemplatePayload>) {
    return this.missionsService.updateTemplate(user, id, body);
  }

  @Get("children/:childId/missions/today")
  today(@CurrentUser() user: AuthenticatedUser, @Param("childId") childId: string, @Query("date") date?: string) {
    return this.missionsService.today(user, childId, date);
  }

  @Post("mission-occurrences/:id/snooze")
  snooze(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { requestedMinutes: number; source?: string }) {
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
    @Body() body: { type: string; payload: Record<string, unknown>; confidence?: number }
  ) {
    return this.missionsService.submitProof(user, id, body);
  }

  @Post("mission-occurrences/:id/parent-review")
  parentReview(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { action: "approve" | "reject"; note?: string }) {
    return this.missionsService.parentReview(user, id, body);
  }
}

