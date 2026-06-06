import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./common/prisma.service";
import { AuthModule } from "./modules/auth/auth.module";
import { ChildrenModule } from "./modules/children/children.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { MissionsModule } from "./modules/missions/missions.module";
import { ChatModule } from "./modules/chat/chat.module";
import { OpenClawModule } from "./modules/openclaw/openclaw.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { CoinsModule } from "./modules/coins/coins.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "development-only-change-me",
      signOptions: { expiresIn: "15m" }
    }),
    AuthModule,
    ChildrenModule,
    DevicesModule,
    MissionsModule,
    ChatModule,
    OpenClawModule,
    AlertsModule,
    CoinsModule
  ],
  providers: [PrismaService],
  exports: [PrismaService]
})
export class AppModule {}

