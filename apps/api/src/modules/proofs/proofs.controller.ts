import { BadRequestException, Controller, Get, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthenticatedUser } from "@family-manager/shared";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { ProofsService } from "./proofs.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  @Post("mission-occurrences/:id/proofs/uploads")
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Req() req: FastifyRequest
  ) {
    let part: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      part = await req.file();
    } catch {
      throw new BadRequestException("Invalid multipart upload");
    }
    if (!part) {
      throw new BadRequestException("No file uploaded");
    }

    let data: Buffer;
    try {
      data = await part.toBuffer();
    } catch {
      // @fastify/multipart throws when the file exceeds the configured size limit.
      throw new BadRequestException("File exceeds the maximum allowed size");
    }

    return this.proofs.upload(user, id, {
      filename: part.filename,
      mimetype: part.mimetype,
      data
    });
  }

  @Get("mission-occurrences/:id/proofs/:proofId/file")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("proofId") proofId: string,
    @Res() reply: FastifyReply
  ) {
    const { stream, contentType } = await this.proofs.readProofFile(user, id, proofId);
    reply.header("Content-Type", contentType);
    return reply.send(stream);
  }
}
