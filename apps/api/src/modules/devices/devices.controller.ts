import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import {
  AuthenticatedUser,
  ClaimDeviceInput,
  ClaimDeviceInputSchema,
  CreatePairingCodeInput,
  CreatePairingCodeInputSchema,
  RegisterFcmTokenInput,
  RegisterFcmTokenInputSchema
} from "@family-manager/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { DevicesService } from "./devices.service";

@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @UseGuards(JwtAuthGuard)
  @Post("pairing-codes")
  createPairingCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePairingCodeInputSchema)) body: CreatePairingCodeInput
  ) {
    return this.devicesService.createPairingCode(user, body);
  }

  @Post("claim")
  claim(@Body(new ZodValidationPipe(ClaimDeviceInputSchema)) body: ClaimDeviceInput) {
    return this.devicesService.claim(body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("fcm-token")
  registerFcmToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(RegisterFcmTokenInputSchema)) body: RegisterFcmTokenInput
  ) {
    return this.devicesService.registerFcmToken(user, body.fcmToken);
  }
}
