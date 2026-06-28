import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { AuthenticatedUser, CreateChildInput, CreateChildInputSchema } from "@family-manager/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
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
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(CreateChildInputSchema)) body: CreateChildInput) {
    return this.childrenService.create(user, body);
  }
}

