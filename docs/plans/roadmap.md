# Roadmap

Phased view of where the project is going. Each item links to detail rather than restating it.

## Now

- **Device Action Bridge — Android handlers** — server backbone is done (see Done); remaining is the on-device capability-handler registry + mock handler and the first real `read_calendar` handler, which need an emulator. Plan phases 5–6 in [device-action-bridge-plan.md](device-action-bridge-plan.md).

## Done

- **Documentation system** — canonical `docs/`, `CLAUDE.md`/`AGENTS.md`, human READMEs/guides.
- **Android bring-up Phases 0–5** — build/pairing, real today screen, mission actions, chat + confirm cards, parent mode, and resilience (401 refresh, runtime notifications permission, boot alarm rescheduling). See [android-bring-up.md](android-bring-up.md).
- **API hardening** — Zod DTO validation across every endpoint (clean `400`s via `ZodValidationPipe`, schemas in `@family-manager/shared`); integration tests for auth, pairing, protected-mission RBAC, proof rejection, coin idempotency, and chat draft confirmation. See [api hardening in testing.md](../testing.md#api-integration-tests).
- **Proof storage** — local-disk photo upload/download (`ProofStorageService`, `PROOF_STORAGE_PATH` + Docker volume) behind a swappable interface; upload→`storageKey`→photo proof→parent download, with family/child RBAC and integration tests. See [missions.md](../features/missions.md).
- **Worker** — deadline logic (`notify` / `mark-missed` / snooze-deadline rescheduling) extracted into a testable `deadlines.ts` with unit tests, plus a Redis-gated smoke test that runs a real BullMQ job end-to-end. See [worker testing in testing.md](../testing.md#worker-tests--redis-smoke-test).
- **Device Action Bridge — server backbone** — shared capability contracts, the `device_commands`/`device_command_results`/`device_capability_grants` command bus (`GET /devices/commands`, idempotent `POST …/result`, parent capability toggle), adapter + API `read_device_context` draft, and a `scripts/virtual-device.mjs` no-phone harness, all integration-tested. Android handlers (phases 5–6) remain. See [device-action-bridge.md](../features/device-action-bridge.md).

## Later (production hardening)

- Replace `JWT_SECRET` and default Postgres credentials. _(Enforced: the API fails fast at boot in production if `JWT_SECRET` is unset/default/short or `DATABASE_URL` uses the default `family:family` credentials — see `apps/api/src/config/env.ts`. The values still need to be set per deployment.)_
- Configure the real FCM service account.
- Connect the real OpenClaw container on the VPS. See [../deployment.md](../deployment.md).
- Backup/restore for Postgres and proof storage; logging and monitoring.

## Deferred (post-V1, from the spec)

- Phone/app blocking and usage limits (heavyweight device-control capabilities).
- Windows/TV/Oculus clients, Google Calendar sync, Telegram/WhatsApp escalation.
- Homework checking, better photo-proof recognition, custom personalities, web admin dashboard.
