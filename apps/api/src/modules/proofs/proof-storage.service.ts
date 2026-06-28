import { randomUUID } from "node:crypto";
import { createReadStream as fsCreateReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

/** Accepted image mime types mapped to the on-disk file extension. */
export const ACCEPTED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const EXTENSION_TO_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ACCEPTED_IMAGE_TYPES).map(([type, ext]) => [ext, type])
);

/** Matches the @fastify/multipart fileSize limit configured in main.ts. */
export const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024;

export interface UploadedFile {
  filename?: string;
  mimetype: string;
  data: Buffer;
}

export interface StoredProof {
  storageKey: string;
  sizeBytes: number;
  contentType: string;
}

/**
 * Local-disk storage for proof uploads. The only place that touches the filesystem,
 * kept behind a narrow interface so an S3/object-store driver is a contained swap.
 */
@Injectable()
export class ProofStorageService {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  async save(occurrenceId: string, file: UploadedFile): Promise<StoredProof> {
    const ext = ACCEPTED_IMAGE_TYPES[file.mimetype];
    if (!ext) {
      throw new BadRequestException("Unsupported image type");
    }
    if (file.data.length > MAX_PROOF_FILE_BYTES) {
      throw new BadRequestException("File exceeds the maximum allowed size");
    }

    const storageKey = `${occurrenceId}/${randomUUID()}.${ext}`;
    const absolute = this.resolveKey(storageKey);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, file.data);

    return { storageKey, sizeBytes: file.data.length, contentType: file.mimetype };
  }

  createReadStream(storageKey: string): { stream: Readable; contentType: string } {
    const absolute = this.resolveKey(storageKey);
    if (!existsSync(absolute)) {
      throw new NotFoundException("Proof file not found");
    }
    const ext = absolute.split(".").pop() ?? "";
    const contentType = EXTENSION_TO_TYPE[ext] ?? "application/octet-stream";
    return { stream: fsCreateReadStream(absolute), contentType };
  }

  /** Resolves a storage key under the base dir, rejecting traversal/absolute paths. */
  private resolveKey(storageKey: string): string {
    if (!storageKey || isAbsolute(storageKey) || storageKey.split(/[\\/]/).includes("..")) {
      throw new BadRequestException("Invalid storage key");
    }
    const absolute = resolve(this.base, normalize(storageKey));
    if (absolute !== this.base && !absolute.startsWith(this.base + sep)) {
      throw new BadRequestException("Invalid storage key");
    }
    return absolute;
  }
}
