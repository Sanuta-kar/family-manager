# Device Action Bridge — Implementation Plan

> The sequencing outline for the bridge specified in [../features/device-action-bridge.md](../features/device-action-bridge.md). **Phases 1–4 (server backbone) are implemented and tested (2026-06-29).** Phases 5–6 are the on-device Android handlers and need an emulator.

## Gate

The Android app has reached bring-up Phase 5, so device commands have a real on-device app to land in. See [android-bring-up.md](android-bring-up.md).

## Phases

### 1. Shared contracts ✅ done

- Files: `packages/shared/src`.
- Add the `read_device_context` capability request/response types and extend `ChatActionType` / `allowedActions` with the read-only capability identifiers.
- Acceptance: types compile; `pnpm -r typecheck` passes.

### 2. Server command bus ✅ done

- Files: `apps/api/prisma/schema.prisma` (+ migration), `apps/api/src/modules/devices`.
- Add `device_commands` and `device_command_results` tables and per-device capability grants.
- Add endpoints `GET /devices/commands` (pull pending, child-scoped) and `POST /devices/commands/:id/result` (idempotent by `commandId`).
- Add policy + RBAC validation and FCM-ping dispatch when a command is created.
- Acceptance: a command created server-side appears in the device's pull, and a posted result is stored and audited.

### 3. Virtual-device CLI harness (no-phone integration test) ✅ done

- Files: a small script/package under `apps/` or `packages/`.
- Pairs as a child device, polls `GET /devices/commands`, returns synthetic results.
- Acceptance: full server→command→result loop runs end to end with no Android involvement; usable in CI.

### 4. Adapter fallback capability draft ✅ done

- Files: `apps/openclaw-adapter/src`.
- Emit a `read_device_context` draft for a test phrase (e.g. "what's on my calendar today"), within `allowedActions`.
- Acceptance: sending that phrase through the API produces a sanitized read-only capability draft.

### 5. Android capability-handler registry + mock handler ✅ code + JVM tests; ⏳ emulator verification pending

- Files: `apps/android` — `bridge/` package (`CapabilityHandler`, `CapabilityHandlerRegistry`, `DeviceCommandProcessor`, `MockCapabilityHandler`, `DeviceBridge`); `ApiClient.pullDeviceCommands` / `postDeviceCommandResult`; pull wired on app-open (`MainActivity`) and on an FCM `device_command` ping (`FamilyMessagingService`).
- Tests: `DeviceCommandProcessorTest` (registry routing, unknown→failed, handler-throws→failed) and `ApiClientDeviceCommandsTest` (pull/post) — JVM, via ktor `MockEngine`.
- **Remaining (emulator):** confirm a real device pulls a command and posts a result end-to-end (e.g. via `scripts/virtual-device.mjs` or a chat calendar request).

### 6. First real capability — `read_calendar` ✅ code + JVM tests; ⏳ emulator verification pending

- Files: `apps/android` — `bridge/calendar/` (`CalendarReader` interface, `CalendarCapabilityHandler`, `AndroidCalendarReader` via `CalendarContract`); `READ_CALENDAR` in the manifest. Missing permission returns `permission_required`.
- Tests: the handler's granted→`completed`+events and denied→`permission_required` paths are covered in `DeviceCommandProcessorTest` with a fake `CalendarReader` (the real `ContentResolver` wrapper is Android-only).
- **Remaining (emulator):** seed a calendar event (or use a companion stub app) and confirm the handler returns it; confirm `permission_required` without the grant.

## Out of scope

Control/block capabilities (DeviceAdmin / Accessibility / app-blocking) remain deferred; they carry high permission and Play-policy weight. See [roadmap.md](roadmap.md).
