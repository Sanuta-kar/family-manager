# Roadmap

Phased view of where the project is going. Each item links to detail rather than restating it.

## Now

- **Proof storage** — proof upload storage path and real photo metadata handling.

## Done

- **Documentation system** — canonical `docs/`, `CLAUDE.md`/`AGENTS.md`, human READMEs/guides.
- **Android bring-up Phases 0–5** — build/pairing, real today screen, mission actions, chat + confirm cards, parent mode, and resilience (401 refresh, runtime notifications permission, boot alarm rescheduling). See [android-bring-up.md](android-bring-up.md).
- **API hardening** — Zod DTO validation across every endpoint (clean `400`s via `ZodValidationPipe`, schemas in `@family-manager/shared`); integration tests for auth, pairing, protected-mission RBAC, proof rejection, coin idempotency, and chat draft confirmation. See [api hardening in testing.md](../testing.md#api-integration-tests).

## Next

- **Worker** — get Redis running locally and smoke-test; add snooze-deadline rescheduling tests.

## Then

- **Device Action Bridge implementation** — OpenClaw ↔ other Android apps, read-only context first. Spec: [../features/device-action-bridge.md](../features/device-action-bridge.md); plan: [device-action-bridge-plan.md](device-action-bridge-plan.md).

## Later (production hardening)

- Replace `JWT_SECRET` and default Postgres credentials.
- Configure the real FCM service account.
- Connect the real OpenClaw container on the VPS. See [../deployment.md](../deployment.md).
- Backup/restore for Postgres and proof storage; logging and monitoring.

## Deferred (post-V1, from the spec)

- Phone/app blocking and usage limits (heavyweight device-control capabilities).
- Windows/TV/Oculus clients, Google Calendar sync, Telegram/WhatsApp escalation.
- Homework checking, better photo-proof recognition, custom personalities, web admin dashboard.
