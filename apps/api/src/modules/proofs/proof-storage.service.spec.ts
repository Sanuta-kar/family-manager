import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProofStorageService } from "./proof-storage.service";

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

describe("ProofStorageService", () => {
  let baseDir: string;
  let service: ProofStorageService;

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), "proof-storage-"));
    service = new ProofStorageService(baseDir);
  });

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("saves an image and reads back the same bytes and content type", async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const saved = await service.save("occ-1", { filename: "p.png", mimetype: "image/png", data });

    expect(saved.storageKey).toMatch(/^occ-1\/[^/]+\.png$/);
    expect(saved.sizeBytes).toBe(data.length);
    expect(saved.contentType).toBe("image/png");

    const { stream, contentType } = service.createReadStream(saved.storageKey);
    expect(contentType).toBe("image/png");
    const roundTrip = await readStream(stream);
    expect(roundTrip.equals(data)).toBe(true);
  });

  it("rejects an unsupported image type", async () => {
    await expect(
      service.save("occ-1", { filename: "a.gif", mimetype: "image/gif", data: Buffer.from([1]) })
    ).rejects.toThrow();
  });

  it("rejects a storage key that escapes the base directory", () => {
    expect(() => service.createReadStream("../secret")).toThrow();
    expect(() => service.createReadStream("/etc/passwd")).toThrow();
  });

  it("throws when the file does not exist", () => {
    expect(() => service.createReadStream("occ-1/missing.png")).toThrow();
  });
});
