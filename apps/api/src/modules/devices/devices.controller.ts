import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { AuthenticatedUser } from "@family-manager/shared";
import { DevicesService } from "./devices.service";

@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @UseGuards(JwtAuthGuard)
  @Post("pairing-codes")
  createPairingCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { childProfileId: string; expiresInMinutes?: number }
  ) {
    return this.devicesService.createPairingCode(user, body);
  }

  @Post("claim")
  claim(@Body() body: { code: string; deviceName: string; platform: string; fcmToken?: string }) {
    return this.devicesService.claim(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("fcm-token")
  registerFcmToken(@CurrentUser() user: AuthenticatedUser, @Body() body: { fcmToken: string }) {
    return this.devicesService.registerFcmToken(user, body.fcmToken);
  }
}

