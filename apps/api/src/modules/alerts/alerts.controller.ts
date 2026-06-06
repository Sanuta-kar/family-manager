import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { AlertsService } from "./alerts.service";

@UseGuards(JwtAuthGuard)
@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.list(user);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { status: string }) {
    return this.alertsService.update(user, id, body.status);
  }
}

