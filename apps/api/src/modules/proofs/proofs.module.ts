import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ProofsController } from "./proofs.controller";
import { ProofsService } from "./proofs.service";
import { ProofStorageService } from "./proof-storage.service";

function resolveProofStorageDir(): string {
  return process.env.PROOF_STORAGE_PATH ?? join(process.cwd(), "var", "proof-uploads");
}

@Module({
  controllers: [ProofsController],
  providers: [
    ProofsService,
    {
      provide: ProofStorageService,
      useFactory: () => new ProofStorageService(resolveProofStorageDir())
    }
  ]
})
export class ProofsModule {}
