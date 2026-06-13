# Device Action Bridge — Implementation Plan (Deferred)

> **Deferred until after the Android bring-up.** This is the sequencing outline for building the bridge specified in [../features/device-action-bridge.md](../features/device-action-bridge.md). It is not yet broken into bite-sized executable steps; do that (via the writing-plans skill) when the work is scheduled.

## Gate

Do not start until the Android app reaches at least bring-up Phase 1 (real today screen), so device commands have a real on-device app to land in. See [android-bring-up.md](android-bring-up.md).

## Phases

### 1. Shared contracts

- Files: `packages/shared/src`.
- Add the `read_device_context` capability request/response types and extend `ChatActionType` / `allowedActions` with the read-only capability identifiers.
- Acceptance: types compile; `pnpm -r typecheck` passes.

### 2. Server command bus

- Files: `apps/api/prisma/schema.prisma` (+ migration), `apps/api/src/modules/devices`.
- Add `device_commands` and `device_command_results` tables and per-device capability grants.
- Add endpoints `GET /devices/commands` (pull pending, child-scoped) and `POST /devices/commands/:id/result` (idempotent by `commandId`).
- Add policy + RBAC validation and FCM-ping dispatch when a command is created.
- Acceptance: a command created server-side appears in the device's pull, and a posted result is stored and audited.

### 3. Virtual-device CLI harness (no-phone integration test)

- Files: a small script/package under `apps/` or `packages/`.
- Pairs as a child device, polls `GET /devices/commands`, returns synthetic results.
- Acceptance: full server→command→result loop runs end to end with no Android involvement; usable in CI.

### 4. Adapter fallback capability draft

- Files: `apps/openclaw-adapter/src`.
- Emit a `read_device_context` draft for a test phrase (e.g. "what's on my calendar today"), within `allowedActions`.
- Acceptance: sending that phrase through the API produces a sanitized read-only capability draft.

### 5. Android capability-handler registry + mock handler

- Files: `apps/android`.
- Add the on-device handler registry, command pull (on FCM ping + on app-open + periodic), and a mock handler returning canned data.
- Acceptance: emulator pulls a command and posts a synthetic result back through the registry.

### 6. First real capability — `read_calendar`

- Files: `apps/android`.
- Implement a `read_calendar` handler via `CalendarContract` with the `READ_CALENDAR` runtime permission; missing permission returns `permission_required`.
- Add a trivial companion stub app (or use the built-in Calendar) as the cross-app target for tests.
- Acceptance: with a seeded calendar event on the emulator, the handler returns it; without permission, it returns `permission_required`.

## Out of scope

Control/block capabilities (DeviceAdmin / Accessibility / app-blocking) remain deferred; they carry high permission and Play-policy weight. See [roadmap.md](roadmap.md).
