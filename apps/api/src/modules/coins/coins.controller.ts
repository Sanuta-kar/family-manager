import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { CoinsService } from "./coins.service";

@UseGuards(JwtAuthGuard)
@Controller("children/:childId/coins")
export class CoinsController {
  constructor(private readonly coinsService: CoinsService) {}

  @Get()
  getBalance(@CurrentUser() user: AuthenticatedUser, @Param("childId") childId: string) {
    return this.coinsService.getBalance(user, childId);
  }
}

