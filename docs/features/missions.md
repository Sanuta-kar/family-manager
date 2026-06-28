# Feature: Missions, Proof, and Coins

## Purpose

Parents create protected missions for children; children create only their own unprotected reminders. Mission templates expand into dated occurrences, which a child completes by submitting required proof. Completed/approved missions award coins. Missed missions escalate to parents via alerts.

## Data model

- `mission_templates`, `mission_occurrences`, `snooze_events`, `proof_submissions`, `coin_ledger`, `alerts`

Mission occurrence statuses: `scheduled`, `notified`, `snoozed`, `proof_pending`, `parent_review`, `completed`, `failed`, `cancelled`.

## API

- `POST /mission-templates` — create a template (parent for protected missions).
- `PATCH /mission-templates/:id` — update a template.
- `GET /children/:childId/missions/today` — list today's occurrences with their proofs and snoozes.
- `POST /mission-occurrences/:id/snooze` — request a snooze; validated against the snooze policy.
- `POST /mission-occurrences/:id/done` — submit `tap_done` proof.
- `POST /mission-occurrences/:id/proofs` — submit geofence/photo/parent-review proof.
- `POST /mission-occurrences/:id/proofs/uploads` — upload a photo file (multipart); returns the `storageKey` to reference in a `photo` proof.
- `GET /mission-occurrences/:id/proofs/:proofId/file` — download a stored proof file (parent in family, or the owning child).
- `POST /mission-occurrences/:id/parent-review` — parent approve/reject.
- `GET /coins` — child coin balance.
- `GET /alerts`, `PATCH /alerts/:id` — parent alert list and status update.

Source: `apps/api/src/modules/missions`, `apps/api/src/modules/proofs`, `apps/api/src/modules/coins`, `apps/api/src/modules/alerts`.

## Current state

Real and working.

- **Proof validation by type:** `tap_done` requires a valid `tappedAt`; `photo` requires a stored upload reference; `geofence_exit` requires valid coordinates and can validate distance against a configured target/radius; `parent_review` cannot be submitted directly by a child proof request.
- **Proof file storage:** photo uploads are stored on local disk under `PROOF_STORAGE_PATH` (Docker `proof-storage` volume) via `ProofStorageService`, behind an interface so an object-store driver is a contained swap. Upload returns an opaque `storageKey` (namespaced by occurrence); download streams it with the right `Content-Type`, gated by family + child RBAC. Accepts JPEG/PNG/WebP up to 10 MB.
- **Coin idempotency:** awards are once-per-occurrence, enforced by a unique constraint on `CoinLedger.occurrenceId` (migration `20260613120000_unique_coin_occurrence`) and a caught duplicate-insert path, so concurrent completions cannot double-award.
- **Scheduling:** occurrences are scheduled in the child profile's timezone.
- **Snooze:** updates the occurrence deadline; the worker respects the latest deadline rather than the original.
- **RBAC:** children can create only their own unprotected reminders and cannot create or edit protected missions.

## Gaps

- Photo proof has no thumbnailing/resizing, EXIF stripping, or virus scanning yet.
- Mission/proof flows are covered by API integration tests (see [../testing.md](../testing.md#api-integration-tests)); broader edge-case coverage can still grow.
