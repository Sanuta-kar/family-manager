import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { AuthenticatedUser, UserRole } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";

type TokenSubject = AuthenticatedUser & { typ?: "access" | "refresh" };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async bootstrapParent(input: { familyName: string; name: string; email: string; password: string }) {
    const existingParentCount = await this.prisma.user.count({ where: { role: UserRole.Parent } });
    if (existingParentCount > 0) {
      throw new BadRequestException("Parent bootstrap already completed");
    }

    const passwordHash = await hash(input.password, 12);
    const result = await this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({ data: { name: input.familyName } });
      const preset = await tx.agentPersonalityPreset.create({
        data: {
          familyId: family.id,
          name: "Supportive Guide",
          audience: "family",
          systemPrompt: "Be practical, warm, concise, and age-appropriate. Never bypass backend policy.",
          isDefault: true
        }
      });
      const parent = await tx.user.create({
        data: {
          familyId: family.id,
          role: UserRole.Parent,
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
          personalityPresetId: preset.id
        }
      });
      return { family, parent };
    });

    return this.issueTokenPair({
      userId: result.parent.id,
      familyId: result.family.id,
      role: UserRole.Parent
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: { childProfile: true }
    });
    if (!user?.passwordHash || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueTokenPair({
      userId: user.id,
      familyId: user.familyId,
      role: user.role as UserRole,
      childProfileId: user.childProfileId ?? undefined
    });
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TokenSubject>(refreshToken);
      if (payload.typ !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token");
      }
      return this.issueTokenPair({
        userId: payload.userId,
        familyId: payload.familyId,
        role: payload.role,
        childProfileId: payload.childProfileId,
        deviceId: payload.deviceId
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  issueTokenPair(user: AuthenticatedUser) {
    const accessToken = this.jwtService.sign({ ...user, typ: "access" }, { expiresIn: "15m" });
    const refreshToken = this.jwtService.sign({ ...user, typ: "refresh" }, { expiresIn: "30d" });
    return { accessToken, refreshToken, user };
  }
}

