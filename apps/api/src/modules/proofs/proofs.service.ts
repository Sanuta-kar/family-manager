import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@family-manager/shared";
import { PrismaService } from "../../common/prisma.service";
import { assertChildCanAccess } from "../../common/rbac";
import { ProofStorageService, StoredProof, UploadedFile } from "./proof-storage.service";

@Injectable()
export class ProofsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProofStorageService
  ) {}

  /** Stores an uploaded image for an occurrence the caller can access. */
  async upload(user: AuthenticatedUser, occurrenceId: string, file: UploadedFile): Promise<StoredProof> {
    const occurrence = await this.loadAccessibleOccurrence(user, occurrenceId);
    return this.storage.save(occurrence.id, file);
  }

  /** Resolves a stored proof file for download, enforcing family + child access. */
  async readProofFile(user: AuthenticatedUser, occurrenceId: string, proofId: string) {
    const proof = await this.prisma.proofSubmission.findFirst({
      where: { id: proofId, occurrenceId },
      include: { occurrence: true }
    });
    if (!proof || proof.occurrence.familyId !== user.familyId) {
      throw new NotFoundException("Proof file not found");
    }
    assertChildCanAccess(user, proof.occurrence.childProfileId);

    const payload = (proof.payload ?? {}) as Record<string, unknown>;
    const storageKey = payload.storageKey;
    if (typeof storageKey !== "string" || storageKey.length === 0) {
      throw new NotFoundException("Proof file not found");
    }
    return this.storage.createReadStream(storageKey);
  }

  private async loadAccessibleOccurrence(user: AuthenticatedUser, id: string) {
    const occurrence = await this.prisma.missionOccurrence.findFirst({
      where: { id, familyId: user.familyId }
    });
    if (!occurrence) {
      throw new NotFoundException("Mission occurrence not found");
    }
    assertChildCanAccess(user, occurrence.childProfileId);
    return occurrence;
  }
}
