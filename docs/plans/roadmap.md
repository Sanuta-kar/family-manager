# Roadmap

Phased view of where the project is going. Each item links to detail rather than restating it.

## Now

- **Documentation system** — this restructure (canonical `docs/`, `CLAUDE.md`/`AGENTS.md`, human READMEs/guides). Done as part of the current effort.
- **Android Phase 0 baseline** — build, run on emulator, smoke-test pairing, record a current-state assessment. See [android-bring-up.md](android-bring-up.md).

## Next

- **Android bring-up Phases 1–5** — real today screen, mission actions, chat + confirm cards, parent mode, real-device + resilience. See [android-bring-up.md](android-bring-up.md).
- **API hardening** — DTO validation (Zod/class-validator); integration tests for auth, pairing, protected-mission RBAC, child reminder flow, proof rejection, coin idempotency, chat draft confirmation.
- **Proof storage** — proof upload storage path and real photo metadata handling.
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
