import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertChildCanAccess } from "../../common/rbac";

@Injectable()
export class CoinsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(user: AuthenticatedUser, childProfileId: string) {
    assertChildCanAccess(user, childProfileId);
    const child = await this.prisma.childProfile.findFirstOrThrow({
      where: { id: childProfileId, familyId: user.familyId }
    });
    const ledger = await this.prisma.coinLedger.findMany({
      where: { familyId: user.familyId, childProfileId },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return { childProfileId, balance: child.coinBalance, ledger };
  }

  async awardCompletionCoins(input: {
    familyId: string;
    childProfileId: string;
    occurrenceId: string;
    amount: number;
    reason: string;
  }) {
    if (input.amount <= 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.coinLedger.create({
        data: {
          familyId: input.familyId,
          childProfileId: input.childProfileId,
          occurrenceId: input.occurrenceId,
          amount: input.amount,
          reason: input.reason
        }
      }),
      this.prisma.childProfile.update({
        where: { id: input.childProfileId },
        data: { coinBalance: { increment: input.amount } }
      })
    ]);
  }
}

