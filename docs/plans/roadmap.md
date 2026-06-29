# Roadmap

Phased view of where the project is going. Each item links to detail rather than restating it.

## Now

- **Device Action Bridge implementation** — OpenClaw ↔ other Android apps, read-only context first. Spec: [../features/device-action-bridge.md](../features/device-action-bridge.md); plan: [device-action-bridge-plan.md](device-action-bridge-plan.md).

## Done

- **Documentation system** — canonical `docs/`, `CLAUDE.md`/`AGENTS.md`, human READMEs/guides.
- **Android bring-up Phases 0–5** — build/pairing, real today screen, mission actions, chat + confirm cards, parent mode, and resilience (401 refresh, runtime notifications permission, boot alarm rescheduling). See [android-bring-up.md](android-bring-up.md).
- **API hardening** — Zod DTO validation across every endpoint (clean `400`s via `ZodValidationPipe`, schemas in `@family-manager/shared`); integration tests for auth, pairing, protected-mission RBAC, proof rejection, coin idempotency, and chat draft confirmation. See [api hardening in testing.md](../testing.md#api-integration-tests).
- **Proof storage** — local-disk photo upload/download (`ProofStorageService`, `PROOF_STORAGE_PATH` + Docker volume) behind a swappable interface; upload→`storageKey`→photo proof→parent download, with family/child RBAC and integration tests. See [missions.md](../features/missions.md).
- **Worker** — deadline logic (`notify` / `mark-missed` / snooze-deadline rescheduling) extracted into a testable `deadlines.ts` with unit tests, plus a Redis-gated smoke test that runs a real BullMQ job end-to-end. See [worker testing in testing.md](../testing.md#worker-tests--redis-smoke-test).

## Later (production hardening)

- Replace `JWT_SECRET` and default Postgres credentials.
- Configure the real FCM service account.
- Connect the real OpenClaw container on the VPS. See [../deployment.md](../deployment.md).
- Backup/restore for Postgres and proof storage; logging and monitoring.

## Deferred (post-V1, from the spec)

- Phone/app blocking and usage limits (heavyweight device-control capabilities).
- Windows/TV/Oculus clients, Google Calendar sync, Telegram/WhatsApp escalation.
- Homework checking, better photo-proof recognition, custom personalities, web admin dashboard.
