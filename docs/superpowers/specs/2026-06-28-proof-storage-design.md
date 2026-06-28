# Proof File Storage (photo proof)

_Design spec. Created 2026-06-28._

## Problem

Photo proof is half-built. `MissionsService.validateProofSubmission` requires
`payload.storageKey` for a `photo` proof, but there is no endpoint to upload a file and
no way to serve one back. So a child cannot actually complete a photo-proof mission, and a
parent cannot view the photo during review. The infrastructure already anticipates
local-disk storage: `PROOF_STORAGE_PATH=/var/lib/family-manager/proofs` is set in
`infra/docker/docker-compose.yml` (with a `proof-storage` volume) and in `.env.example`.

This is the roadmap's **Proof storage** item.

## Goals

- A child can upload a photo and receive an opaque `storageKey`.
- Submitting a `photo` proof referencing that key completes the mission (per policy).
- A parent (or the owning child) can download the stored file for review.
- Storage is local-disk, behind a small interface so an S3 driver is a contained swap.

## Non-goals

- No thumbnails/resizing, EXIF stripping, virus scanning, S3 driver, or signed URLs.
- No schema migration — proof file metadata stays in `ProofSubmission.payload`.

## Configuration

Consume the existing `PROOF_STORAGE_PATH`. When unset (local dev), default to a
repo-relative `./var/proof-uploads` (gitignored). The directory is created on first write.

## Components

### ProofStorageService

`apps/api/src/modules/proofs/proof-storage.service.ts` — the only place that touches the
filesystem, behind a narrow interface:

- `save(occurrenceId: string, file: { filename?: string; mimetype: string; data: Buffer }) → { storageKey, sizeBytes, contentType }`
  - Validates `mimetype` is an accepted image type; derives the extension from the type.
  - Writes to `<base>/<occurrenceId>/<cuid>.<ext>`; returns `storageKey = "<occurrenceId>/<cuid>.<ext>"`.
- `createReadStream(storageKey: string) → { stream: Readable; contentType: string }`
  - Resolves and validates the key stays within the base dir; throws `NotFoundException` if missing.
- Path-traversal guard: reject keys containing `..` or absolute paths; the resolved path
  must start with the resolved base dir.

Accepted types (centralized constant): `image/jpeg` → `jpg`, `image/png` → `png`,
`image/webp` → `webp`. Max size 10 MB (matches the `@fastify/multipart` limit in `main.ts`).

### Endpoints (ProofsModule + ProofsController)

- `POST /mission-occurrences/:id/proofs/uploads` — `JwtAuthGuard`; loads the occurrence and
  asserts access (`assertChildCanAccess` for a child, family scope for a parent); reads the
  single multipart file via the raw Fastify request (`await req.file()`); validates type and
  size; stores it; returns `{ storageKey, sizeBytes, contentType }`. **201.**
- `POST /mission-occurrences/:id/proofs` — **unchanged.** Client submits
  `{ type: "photo", payload: { storageKey, sizeBytes, contentType } }`.
- `GET /mission-occurrences/:id/proofs/:proofId/file` — `JwtAuthGuard`; loads the proof,
  asserts the proof's occurrence is in the requester's family and the requester can access it;
  reads `payload.storageKey`; streams the file with the correct `Content-Type`. **200.**

The upload/download controllers reuse the missions RBAC. To avoid duplicating
occurrence-lookup logic, a small shared helper (`findOccurrenceForUser`) is exposed from
`MissionsService` (or a thin shared accessor) rather than re-querying ad hoc.

## Authorization

Uploads and downloads both gate on occurrence access via existing RBAC. `storageKey` is
namespaced by `occurrenceId`. Download additionally verifies the proof's occurrence belongs
to the requester's family, so cross-family reads return `404`. Within a family the parent
and the owning child can read; this is acceptable for a private family app.

## Error handling

- No file in the upload → `400` "No file uploaded".
- Unsupported mime type → `400` "Unsupported image type".
- Oversize (multipart throws `RequestFileTooLarge`) → mapped to `413`/`400`.
- Download of a missing/!owned file → `404`.

## Testing

- **Unit** (`proof-storage.service.spec.ts`, temp dir): save→read round-trip returns the same
  bytes and content type; path-traversal keys (`../x`, absolute) are rejected; mime→extension
  mapping; unsupported mime rejected.
- **Integration** (extend `test/integration/api.spec.ts`):
  - upload a tiny PNG buffer → `201` with `storageKey`;
  - submit a `photo` proof referencing it on a photo-policy mission → mission completes;
  - download → `200`, correct `content-type`, bytes match;
  - non-image upload → `400`;
  - download by a second, unrelated family → `404`.

## Rollout / sequencing (for the plan)

1. `ProofStorageService` + unit tests (no HTTP).
2. `ProofsModule`/controller with upload + download; wire into `AppModule`; expose the
   occurrence-access helper.
3. Integration tests for the full flow.
4. Docs: `features/missions.md` gap → done; `testing.md` upload note; `.gitignore`
   `var/proof-uploads`. (Compose volume already documented in `deployment.md`.)

## Open questions

None blocking. Local disk chosen over S3/MinIO to match the single-VPS, self-hosted
deployment; the storage interface keeps an object-store swap contained.
