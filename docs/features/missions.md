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
- `POST /mission-occurrences/:id/parent-review` — parent approve/reject.
- `GET /coins` — child coin balance.
- `GET /alerts`, `PATCH /alerts/:id` — parent alert list and status update.

Source: `apps/api/src/modules/missions`, `apps/api/src/modules/coins`, `apps/api/src/modules/alerts`.

## Current state

Real and working.

- **Proof validation by type:** `tap_done` requires a valid `tappedAt`; `photo` requires a stored upload reference; `geofence_exit` requires valid coordinates and can validate distance against a configured target/radius; `parent_review` cannot be submitted directly by a child proof request.
- **Coin idempotency:** awards are once-per-occurrence, enforced by a unique constraint on `CoinLedger.occurrenceId` (migration `20260613120000_unique_coin_occurrence`) and a caught duplicate-insert path, so concurrent completions cannot double-award.
- **Scheduling:** occurrences are scheduled in the child profile's timezone.
- **Snooze:** updates the occurrence deadline; the worker respects the latest deadline rather than the original.
- **RBAC:** children can create only their own unprotected reminders and cannot create or edit protected missions.

## Gaps

- No DTO validation library on request bodies yet.
- No proof file upload storage path / real photo metadata handling yet.
- No automated API tests yet (worker scheduling is tested — see [push-notifications.md](push-notifications.md)).
