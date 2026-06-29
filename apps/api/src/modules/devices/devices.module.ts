import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { DeviceCommandsController } from "./device-commands.controller";
import { DeviceCommandsService } from "./device-commands.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DevicesController, DeviceCommandsController],
  providers: [DevicesService, DeviceCommandsService],
  exports: [DevicesService, DeviceCommandsService]
})
export class DevicesModule {}
