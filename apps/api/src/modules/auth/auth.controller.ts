import { Body, Controller, Post } from "@nestjs/common";
import {
  BootstrapParentInput,
  BootstrapParentInputSchema,
  LoginInput,
  LoginInputSchema,
  RefreshInput,
  RefreshInputSchema
} from "@family-manager/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("parent/bootstrap")
  bootstrapParent(@Body(new ZodValidationPipe(BootstrapParentInputSchema)) body: BootstrapParentInput) {
    return this.authService.bootstrapParent(body);
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(LoginInputSchema)) body: LoginInput) {
    return this.authService.login(body.email, body.password);
  }

  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(RefreshInputSchema)) body: RefreshInput) {
    return this.authService.refresh(body.refreshToken);
  }
}
