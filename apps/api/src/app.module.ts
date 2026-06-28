import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./common/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChildrenModule } from "./modules/children/children.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { MissionsModule } from "./modules/missions/missions.module";
import { ProofsModule } from "./modules/proofs/proofs.module";
import { ChatModule } from "./modules/chat/chat.module";
import { OpenClawModule } from "./modules/openclaw/openclaw.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { CoinsModule } from "./modules/coins/coins.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? "development-only-change-me",
      signOptions: { expiresIn: "15m" }
    }),
    PrismaModule,
    AuthModule,
    ChildrenModule,
    DevicesModule,
    MissionsModule,
    ProofsModule,
    ChatModule,
    OpenClawModule,
    AlertsModule,
    CoinsModule
  ]
})
export class AppModule {}
