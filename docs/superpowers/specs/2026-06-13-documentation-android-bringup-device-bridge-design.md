# Design: Documentation System, Android Bring-Up, and Device Action Bridge

Date: 2026-06-13
Status: Approved (brainstorming) — ready for implementation planning

## Purpose

Three coupled goals, all in service of "continue this project with an agent and a human, and find out where it actually stands":

1. **Documentation system** — restructure project docs so an agent can navigate them and a human can read them, without the rot the current docs already show. LLM-oriented canonical docs plus clear human READMEs covering assistant ("bot") usage and testing.
2. **Android bring-up plan** — a concrete path to run the existing app on the emulator, then a real device, and turn today's UI stubs into real API-backed flows.
3. **Device Action Bridge spec** — the architecture and protocol that lets OpenClaw (running in a container on the VPS) interact with other Android apps on the family's devices, mediated through the server. Spec only in this effort; no bridge code.

Out of scope for this effort: implementing the bridge, backend hardening beyond what Android bring-up requires, and any heavyweight device-control capabilities.

## Context: actual current state

Grounded in the real code, not the older docs:

- **API (`apps/api`, NestJS/Fastify):** real auth (bootstrap/login/refresh), child device pairing (code generation + claim), mission templates/occurrences, proof validation, snooze policy, parent review, coin ledger, alerts, chat → OpenClaw orchestration, and chat action drafts with confirm/reject. No DTO validation library, no test files.
- **Worker (`apps/worker`, BullMQ):** real `expand-occurrences`, `notify-occurrence`, `mark-missed` jobs; real FCM push client (graceful skip without credentials); has scheduling + push tests.
- **OpenClaw adapter (`apps/openclaw-adapter`, Fastify):** `GET /health`, `POST /chat`. Proxies to `OPENCLAW_BASE_URL` if set, otherwise a deterministic regex fallback that drafts a daily reminder. Sanitizes any `actionDraft` not in `allowedActions`.
- **Telegram-Codex bridge (`apps/telegram-codex`):** a **developer tool** that runs `codex exec` from Telegram. Not a family-facing feature.
- **Android (`apps/android`, Kotlin/Compose):** `ApiClient` has real methods (`claimDevice`, `today`, `sendChatMessage`, `registerFcmToken`); `SessionStore` persists tokens; `FamilyMessagingService` and `AlarmActivity` exist. But `MainActivity` shows **hardcoded** mission cards and mock chat; Done/Snooze/Talk and parent "Generate Code" are unwired; nothing calls `apiClient.today()`.
- **Shared (`packages/shared`):** roles, mission/draft/proof/alert enums, mission + OpenClaw request/response contracts, schedule/timezone utilities.
- **Infra (`infra/docker`):** Compose with caddy, api, worker, openclaw-adapter, postgres (host `5433`), redis, and a **placeholder** `openclaw` service behind the `openclaw` profile.
- **Docs today:** `spec.md` (good), `architecture.md` (good but thin), `development-handoff.md` (**stale** — wrong repo path, claims code uncompiled while testing doc says tests pass), `local-development-testing.md` (most current).
- **Paths:** local working dir is `/Users/annakukuy/private/fm/family-manager`; the VPS deployment path is `/srv/fm/family-manager`. These differ by design and the local dir will **not** be renamed.

---

## Section 1 — Documentation system

### Principle

Single source of truth. Each fact is written **once** in `docs/`. Human-facing files (root README, per-app READMEs, `docs/guides/`) and the agent entry point (`CLAUDE.md`) **link into** `docs/` rather than restating it, so nothing drifts. `docs/` + `CLAUDE.md` are the agent surface; READMEs + `guides/` are the human surface. `AGENTS.md` is a **symlink to `CLAUDE.md`** so Codex and other agents share the same entry point without a second copy to maintain (committed as a symlink so it survives clone/checkout).

### Path convention (prevents the rot we are fixing)

- Docs refer to paths **relative to the repo root** (`apps/api`, `docs/testing.md`). Never hardcode a developer's home path.
- The **only** place an absolute path appears is `docs/deployment.md`, which records the VPS canonical path `/srv/fm/family-manager` and notes the OpenClaw container runs alongside it.
- `CLAUDE.md` states this convention explicitly.

### Target layout

```
README.md                     # Human: what it is, short quick start, links out. Thin.
CLAUDE.md                     # Agent entry point: project map, stack, conventions,
                              #   build/test commands, current status, pointers into docs/.
AGENTS.md                     # Symlink -> CLAUDE.md, so Codex and other agents read the
                              #   same single source.

docs/
  spec.md                     # Product spec (keep; light update). Source of truth for "what".
  architecture.md             # Runtime topology + authority boundaries. Expanded to add the
                              #   VPS/OpenClaw topology and the bridge command flow.
  deployment.md               # NEW. VPS layout (/srv/fm/family-manager), Docker Compose,
                              #   OpenClaw container wiring, secrets, ports. Absorbs the
                              #   "continue on VPS" half of the retired handoff doc.
  testing.md                  # Canonical testing reference: backend smoke, manual API flows,
                              #   emulator, real device, bridge simulation. Supersedes
                              #   local-development-testing.md.
  features/                   # One file per capability: purpose / data model / API /
                              #   current state / gaps.
    missions.md
    auth-and-pairing.md
    chat-and-drafts.md
    push-notifications.md
    device-action-bridge.md   # NEW feature spec (read-only context = V1).
  plans/
    roadmap.md                # Phased roadmap; consolidates scattered "next steps" lists.
    android-bring-up.md       # Section 2 of this design, written up.
    device-action-bridge-plan.md  # Bridge implementation plan (later phase; spec-only now).
  guides/                     # HUMAN-facing, task-oriented, minimal jargon.
    using-the-assistant.md    # How a parent/child uses the in-app OpenClaw chat ("bot usage").
    testing-walkthrough.md    # Step-by-step for a person to run a local test session.

apps/android/README.md        # Thin: open in Android Studio, build, emulator/device run.
apps/api/README.md            # Thin: run API locally, env, prisma.
```

### "Bot usage" decision

The user-facing **"bot"** in `guides/using-the-assistant.md` is the **in-app OpenClaw assistant** that families actually use. The **Telegram-Codex bridge is a developer tool**, documented in `apps/telegram-codex/README.md` and the root README's developer section — not in the family user guide.

### De-staling

- `development-handoff.md` is **retired**. Implemented-state facts move into the `features/` files and a "Current status" section in `CLAUDE.md`; the "continue on VPS" half moves to `docs/deployment.md`.
- `local-development-testing.md` becomes `docs/testing.md` (canonical), with the human step-by-step extracted to `docs/guides/testing-walkthrough.md`.

---

## Section 2 — Android bring-up plan

Path from "compiles" to "real flows," ordered so the earliest phase delivers the "see where it stands" answer.

### Phase 0 — Build & run baseline ("see where it stands")

- Confirm the app builds (Gradle wrapper / Android Studio). Backend running locally (API `:4000`, Postgres `:5433`; Redis + worker optional this phase).
- Emulator points at `http://10.0.2.2:4000/api`. Confirm launch and that the child pairing screen renders.
- **Smoke test:** generate a pairing code via the API, claim it in the emulator, confirm tokens persist in `SessionStore`.
- Confirm FCM token registration **fails gracefully** with no `google-services.json` — pairing must not crash.
- **Output:** a written "current state" assessment of what actually works on a device today.

### Phase 1 — Real today screen

- Replace hardcoded cards with `apiClient.today(childId)`; render real `MissionOccurrenceDto`s with loading/empty/error states.
- **Backend dependency:** the child token is scoped to a `childProfileId`, but the app needs that id to call `today()`. Verify whether `claimDevice` returns it; if not, add it to the claim response (or add a lightweight `GET /me`).

### Phase 2 — Mission actions

- Wire Done → `POST /mission-occurrences/:id/done`, Snooze → `/snooze`, Talk → open chat.
- Wire the same three actions in `AlarmActivity` (currently the buttons only close).

### Phase 3 — Chat + confirm cards

- Real thread create/list, send message, render OpenClaw response.
- Show a **Confirm card** when a response carries an action draft → `POST /action-drafts/:id/confirm` | `/reject`.

### Phase 4 — Parent mode

- Parent bootstrap/login UI.
- Wire "Generate Code" → `POST /devices/pairing-codes` (display code; optionally QR).
- Real children list, coins, alerts.

### Phase 5 — Real device + resilience

- 401 → refresh-token flow.
- Real phone on LAN: `./gradlew :app:assembleDebug -PFAMILY_MANAGER_DEBUG_API_BASE_URL=http://<lan-ip>:4000/api`.
- Runtime permission prompts: notifications (Android 13+), exact alarm, full-screen intent.
- Boot-time alarm rescheduling (`BootReceiver`). (Room cache stays a later roadmap item.)

### Push testing strategy (decision)

Real FCM needs a Firebase project: `google-services.json` on the app and `FCM_SERVICE_ACCOUNT_JSON` on the worker. To avoid blocking UI/alarm testing on that setup, **decouple** them:

- Test the reminder/alarm UX by triggering `AlarmActivity` directly via an `adb` intent — no push required.
- Treat real end-to-end FCM delivery as its own checklist item once a Firebase project exists.
- `docs/testing.md` documents both paths.

---

## Section 3 — Device Action Bridge spec

Spec only in this effort. Implementation is sequenced in `docs/plans/device-action-bridge-plan.md` and gated behind Android bring-up.

### Problem and constraints

OpenClaw runs in a container on the VPS and has **no path to a phone except through the server**. On Android, one app cannot freely read or control another; cross-app interaction only happens through OS-exposed mechanisms (`Intent`/deep links, `ContentProvider`, `UsageStatsManager`, `NotificationListenerService`, `DevicePolicyManager`, `AccessibilityService`), each gated by a permission the app must hold.

These two facts force the architecture: **OpenClaw never touches devices or other apps. The family-manager Android app is the on-device agent.** OpenClaw *requests a capability*; the server validates and dispatches a command; the app executes it with the permissions it holds; the result flows back. "Communicating with other apps" is "our app acting on other apps on OpenClaw's behalf."

### Authority model

Reuses the existing advisory → draft → validate → confirm pattern (today used for schedule changes), pointed at the device instead of the database. OpenClaw is advisory; the server is the source of truth and the only mutator; sensitive actions require explicit confirmation.

### Three layers

1. **OpenClaw-facing capability contract** — extends the existing `allowedActions` / `ChatActionType`. OpenClaw may only request capabilities the server advertises for that user/role/policy. The adapter already sanitizes any `actionDraft` outside `allowedActions`.
2. **Server command bus (outbox/inbox)** — durable command records dispatched via FCM-ping + authenticated REST pull. The durable store, not FCM, is the source of truth.
3. **Android capability-handler registry** — each handler wraps exactly one OS integration mechanism, gated by runtime permission + parent policy. New handlers plug in without changing the protocol (the on-device "plugin").

### Data model (new tables)

- `device_commands` — `id, deviceId, childProfileId, capabilityType, params(json), status(pending|dispatched|completed|failed|rejected|expired), requiresConfirmation, confirmedBy, originDraftId, createdAt, expiresAt`
- `device_command_results` — `id, commandId, status, payload(json), error, receivedAt`
- Per-device advertised capabilities + per-capability grant, recorded at device registration, so the server knows what a device can do and whether the parent enabled it.

### Transport / flow (read-only context, V1)

1. OpenClaw (via adapter) emits a capability request as an action draft, e.g. `{ type: "read_device_context", payload: { kind: "calendar", range: "today" } }`, only if that capability is in `allowedActions`.
2. Server validates RBAC + policy. Read-only/low-risk → auto-approve under policy; sensitive → parent/user **Confirm card** first.
3. Server writes `device_commands` (status `pending`) and sends a small **FCM data ping** to wake the device.
4. Device pulls pending commands via authenticated REST (`GET /devices/commands`) and matches each to a registered capability handler. The device also polls on app-open and periodically, so a dropped ping is not fatal — REST is the source of truth.
5. Handler executes via the OS mechanism, respecting runtime permission; missing permission returns a `permission_required` result rather than failing silently.
6. Device POSTs the result → `POST /devices/commands/:id/result`. Server stores it, logs to the existing `agent_audit_logs`, updates command status, and feeds the data back to OpenClaw on its next turn.

Cross-cutting: commands carry an expiry; results are idempotent by `commandId`; commands are scoped to the device's token.

### V1 capability set (read-only context)

- `read_calendar` — `CalendarContract`, `READ_CALENDAR`.
- `read_app_usage` — `UsageStatsManager`, special access grant.
- `read_device_state` — coarse battery/connectivity/location (optional).

Each capability gets a typed request/response schema in `packages/shared`.

### Safety model

- Per-capability policy: which roles may request, auto-approve vs. confirm, and data minimization to only the declared output.
- Parent can disable any capability per child.
- Every command and result is audited via `agent_audit_logs`.
- OpenClaw only ever receives a capability's declared output, never raw device data.

### Testing / simulation (three seams)

- **OpenClaw seam:** extend the adapter's deterministic fallback to emit a `read_device_context` draft for a phrase like "what's on my calendar today" — no real OpenClaw required.
- **Device-channel seam:** a **virtual-device CLI harness** that pairs as a child device, polls `GET /devices/commands`, and returns synthetic canned results. Exercises the full server↔device loop with **no phone** and doubles as an integration test.
- **On-device seam:** a **mock capability handler** returning canned data (proves the on-device protocol with no real permissions); then a real `read_calendar` handler against a seeded event in the emulator's system Calendar, with a trivial **companion stub app** (or the built-in Calendar) as the cross-app target to prove the Android sandbox is actually crossed.
- **Negative tests:** capability not in `allowedActions` → rejected; permission missing → `permission_required`; expired command; idempotent result by `commandId`.

### Phasing

Spec now. The implementation plan sequences: shared schemas → server tables + endpoints → virtual-device harness → adapter fallback draft → emulator mock handler → one real read-only handler (`read_calendar`). Heavyweight control/block capabilities (DeviceAdmin / Accessibility / app-blocking) stay explicitly deferred to a later phase.

---

## Deliverables of this effort

1. The full documentation system above (new structure, de-staled, READMEs + guides + `CLAUDE.md`).
2. `docs/plans/android-bring-up.md` capturing Section 2.
3. `docs/features/device-action-bridge.md` and `docs/plans/device-action-bridge-plan.md` capturing Section 3 (spec only).
4. `docs/plans/roadmap.md` consolidating the scattered next-step lists into a phased roadmap.

No bridge code and no Android feature code are produced by this effort; those follow from the plans.
