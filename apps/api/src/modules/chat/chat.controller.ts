import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { ChatService } from "./chat.service";

@UseGuards(JwtAuthGuard)
@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get("threads")
  listThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.listThreads(user);
  }

  @Post("threads")
  createThread(@CurrentUser() user: AuthenticatedUser, @Body() body: { title?: string; childProfileId?: string }) {
    return this.chatService.createThread(user, body);
  }

  @Get("threads/:id/messages")
  listMessages(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.chatService.listMessages(user, id);
  }

  @Post("threads/:id/messages")
  sendMessage(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: { text: string }) {
    return this.chatService.sendMessage(user, id, body.text);
  }

  @Post("action-drafts/:id/confirm")
  confirmDraft(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.chatService.confirmDraft(user, id);
  }

  @Post("action-drafts/:id/reject")
  rejectDraft(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.chatService.rejectDraft(user, id);
  }
}

