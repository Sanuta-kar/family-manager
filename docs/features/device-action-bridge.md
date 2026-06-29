# Feature: Device Action Bridge

**Status: server backbone + Android handler code implemented; emulator verification pending.**
The shared capability contracts, server command bus, adapter capability draft, and a no-phone
virtual-device harness are built and tested (plan phases 1–4). The on-device Android
capability-handler registry, command-pull client, and the `read_calendar` handler (phases 5–6)
are written with JVM unit tests; what remains is end-to-end verification on an emulator (a real
device pulling a command and a seeded calendar event). Sequenced in
[../plans/device-action-bridge-plan.md](../plans/device-action-bridge-plan.md).

## On-device (Android) — implemented, emulator verification pending

`apps/android/.../bridge/`: a `CapabilityHandler` registry routes each pulled command to a
handler (`calendar` → `CalendarCapabilityHandler` over `CalendarContract`; `app_usage` /
`device_state` → mock handlers for now), `DeviceCommandProcessor` runs the pull → execute →
report cycle, and `DeviceBridge` wires it for the current child session. `ApiClient` gained
`pullDeviceCommands` / `postDeviceCommandResult`. The pull is triggered on app-open and on an
FCM `device_command` ping. A missing `READ_CALENDAR` grant returns `permission_required`.
JVM unit tests cover the registry routing, the calendar handler's granted/denied paths, and
the client methods (ktor `MockEngine`).

## Implemented (V1, read-only context)

- **Shared contracts** (`packages/shared`): `ChatActionType.ReadDeviceContext`, the
  `read_device_context` allowed-action, `DeviceCapabilityKind` (calendar/app_usage/device_state),
  `DEVICE_CAPABILITY_POLICY`, and Zod schemas for the read-context payload and command result.
- **Server command bus** (`apps/api/src/modules/devices`): `DeviceCommand`,
  `DeviceCommandResult`, `DeviceCapabilityGrant` tables; `DeviceCommandsService`; endpoints
  `GET /devices/commands` (device-scoped pull, marks dispatched, expires stale),
  `POST /devices/commands/:id/result` (idempotent by command, audited), and
  `PATCH /devices/:deviceId/capabilities/:capabilityType` (parent enable/disable). Commands are
  created when a `read_device_context` chat draft is confirmed.
- **Adapter + API fallback**: a calendar/schedule phrase yields a sanitized
  `read_device_context` draft; sanitize maps each draft type to its required allowed-action.
- **Virtual-device harness**: `scripts/virtual-device.mjs` pairs/polls/responds with canned
  data; the same loop is covered in-process by the API integration suite.

**Deferred from this pass:** the FCM data ping on command creation. The durable store + device
polling (on app-open / periodic) is the source of truth, so the ping is a latency optimization,
not a correctness requirement (see "Transport / flow" below). Auto-approve for read-only
capabilities is currently routed through the same Confirm flow as other drafts.

## Purpose and constraints

OpenClaw runs in a container on the VPS and has **no path to a phone except through the server**. On Android, one app cannot freely read or control another; cross-app interaction only happens through OS-exposed mechanisms (`Intent`/deep links, `ContentProvider`, `UsageStatsManager`, `NotificationListenerService`, `DevicePolicyManager`, `AccessibilityService`), each gated by a permission the app must hold.

Those two facts force the design: **OpenClaw never touches devices or other apps. The family-manager Android app is the on-device agent.** OpenClaw *requests a capability*; the server validates and dispatches a command; the app executes it with the permissions it holds; the result flows back. "Communicating with other apps" is "our app acting on other apps on OpenClaw's behalf."

## Authority model

Reuses the existing advisory → draft → validate → confirm pattern (today used for schedule changes; see [chat-and-drafts.md](chat-and-drafts.md)), pointed at the device instead of the database. OpenClaw is advisory; the server is the source of truth and the only mutator; sensitive actions require explicit confirmation.

## Three layers

1. **OpenClaw-facing capability contract** — extends the existing `allowedActions` / `ChatActionType` in `packages/shared`. OpenClaw may only request capabilities the server advertises for that user/role/policy. The adapter already sanitizes any `actionDraft` outside `allowedActions`.
2. **Server command bus (outbox/inbox)** — durable command records dispatched via FCM-ping + authenticated REST pull. The durable store, not FCM, is the source of truth.
3. **Android capability-handler registry** — each handler wraps exactly one OS integration mechanism, gated by runtime permission + parent policy. New handlers plug in without changing the protocol (the on-device "plugin").

## Data model (new)

- `device_commands` — `id, deviceId, childProfileId, capabilityType, params(json), status(pending|dispatched|completed|failed|rejected|expired), requiresConfirmation, confirmedBy, originDraftId, createdAt, expiresAt`
- `device_command_results` — `id, commandId, status, payload(json), error, receivedAt`
- Per-device advertised capabilities and per-capability grant, recorded at device registration, so the server knows what a device can do and whether the parent enabled it.

## Transport / flow (read-only context, V1)

1. OpenClaw (via the adapter) emits a capability request as an action draft, e.g. `{ type: "read_device_context", payload: { kind: "calendar", range: "today" } }`, only if that capability is in `allowedActions`.
2. The server validates RBAC + policy. Read-only/low-risk → auto-approve under policy; sensitive → user/parent **Confirm card** first.
3. The server writes `device_commands` (status `pending`) and sends a small **FCM data ping** to wake the device.
4. The device pulls pending commands via authenticated REST (`GET /devices/commands`) and matches each to a registered capability handler. The device also polls on app-open and periodically, so a dropped ping is not fatal — REST is the source of truth.
5. The handler executes via the OS mechanism, respecting runtime permission; missing permission returns a `permission_required` result rather than failing silently.
6. The device POSTs the result (`POST /devices/commands/:id/result`). The server stores it, logs to `agent_audit_logs`, updates command status, and feeds the data back to OpenClaw on its next turn.

Cross-cutting: commands carry an expiry; results are idempotent by `commandId`; commands are scoped to the device's token.

## V1 capability set (read-only context)

- `read_calendar` — `CalendarContract`, `READ_CALENDAR` permission.
- `read_app_usage` — `UsageStatsManager`, special-access grant.
- `read_device_state` — coarse battery/connectivity/location (optional).

Each capability has a typed request/response schema in `packages/shared`.

## Safety model

- Per-capability policy: which roles may request, auto-approve vs. confirm, and data minimization to only the declared output.
- A parent can disable any capability per child.
- Every command and result is audited via `agent_audit_logs`.
- OpenClaw only ever receives a capability's declared output, never raw device data.

## Testing / simulation (three seams)

Most of the bridge can be exercised without a phone:

- **OpenClaw seam:** extend the adapter's deterministic fallback to emit a `read_device_context` draft for a phrase like "what's on my calendar today" — no real OpenClaw required.
- **Device-channel seam:** a **virtual-device CLI harness** that pairs as a child device, polls `GET /devices/commands`, and returns synthetic canned results. Exercises the full server↔device loop with no phone and doubles as an integration test.
- **On-device seam:** a **mock capability handler** returning canned data (proves the on-device protocol with no real permissions); then a real `read_calendar` handler against a seeded event in the emulator's system Calendar, with a trivial **companion stub app** (or the built-in Calendar) as the cross-app target to prove the Android sandbox is actually crossed.
- **Negative tests:** capability not in `allowedActions` → rejected; permission missing → `permission_required`; expired command; idempotent result by `commandId`.

## Out of scope (deferred)

Heavyweight control/block capabilities (DeviceAdmin / Accessibility / app-blocking, screen-time enforcement) carry high permission and Play-policy weight and are deferred to a later phase. See [../plans/roadmap.md](../plans/roadmap.md).
