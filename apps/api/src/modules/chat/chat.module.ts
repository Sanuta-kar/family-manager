import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { OpenClawModule } from "../openclaw/openclaw.module";
import { MissionsModule } from "../missions/missions.module";

@Module({
  imports: [OpenClawModule, MissionsModule],
  controllers: [ChatController],
  providers: [ChatService]
})
export class ChatModule {}

