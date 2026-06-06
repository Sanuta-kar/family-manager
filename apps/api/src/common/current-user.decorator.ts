import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
  return request.user;
});

