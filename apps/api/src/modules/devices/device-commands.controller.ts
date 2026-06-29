import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  AuthenticatedUser,
  DeviceCapabilityKind,
  DeviceCommandResultInput,
  DeviceCommandResultInputSchema,
  SetCapabilityGrantInput,
  SetCapabilityGrantInputSchema
} from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { DeviceCommandsService } from "./device-commands.service";

const capabilityTypeSchema = z.nativeEnum(DeviceCapabilityKind);

@UseGuards(JwtAuthGuard)
@Controller("devices")
export class DeviceCommandsController {
  constructor(private readonly commands: DeviceCommandsService) {}

  @Get("commands")
  listCommands(@CurrentUser() user: AuthenticatedUser) {
    return this.commands.listPendingForDevice(user);
  }

  @Post("commands/:id/result")
  submitResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(DeviceCommandResultInputSchema)) body: DeviceCommandResultInput
  ) {
    return this.commands.submitResult(user, id, body);
  }

  @Patch(":deviceId/capabilities/:capabilityType")
  setCapabilityGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId") deviceId: string,
    @Param("capabilityType", new ZodValidationPipe(capabilityTypeSchema)) capabilityType: DeviceCapabilityKind,
    @Body(new ZodValidationPipe(SetCapabilityGrantInputSchema)) body: SetCapabilityGrantInput
  ) {
    return this.commands.setCapabilityGrant(user, deviceId, capabilityType, body.enabled);
  }
}
