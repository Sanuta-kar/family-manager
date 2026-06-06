import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { AuthenticatedUser } from "@family-manager/shared";
import { ChildrenService } from "./children.service";

@UseGuards(JwtAuthGuard)
@Controller("children")
export class ChildrenController {
  constructor(private readonly childrenService: ChildrenService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.childrenService.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: { name: string; timezone?: string }) {
    return this.childrenService.create(user, body);
  }
}

