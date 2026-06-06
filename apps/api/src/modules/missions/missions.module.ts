import { Module } from "@nestjs/common";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";
import { CoinsModule } from "../coins/coins.module";
import { AlertsModule } from "../alerts/alerts.module";

@Module({
  imports: [CoinsModule, AlertsModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService]
})
export class MissionsModule {}

