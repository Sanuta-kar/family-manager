# Android Bring-Up Plan

The path from "the app compiles" to "real API-backed flows," ordered so the first phase answers "where does it stand today." Grounded in the current code: `ApiClient` already has real methods (`claimDevice`, `today`, `sendChatMessage`, `registerFcmToken`); `SessionStore` persists tokens; `FamilyMessagingService` and `AlarmActivity` exist. But `MainActivity` still shows hardcoded mission cards and mock chat; the Done/Snooze/Talk and parent "Generate Code" buttons are unwired; nothing calls `apiClient.today()`.

## Phase 0 — Build & run baseline ("see where it stands")

- Confirm the app builds (Android Studio / Gradle). There is currently **no Gradle wrapper** in `apps/android` — generate one first (`gradle wrapper --gradle-version 8.7`, or let Android Studio create it on first sync).
- Backend running locally (API `:4000`, Postgres `:5433`; Redis + worker optional this phase).
- Emulator points at `http://10.0.2.2:4000/api`. Confirm launch and that the child pairing screen renders.
- **Smoke test:** generate a pairing code via the API, claim it in the emulator, confirm tokens persist in `SessionStore`.
- Confirm FCM token registration **fails gracefully** with no `google-services.json` — pairing must not crash.
- **Output:** the dated current-state assessment at the bottom of this file.

## Phase 1 — Real today screen

- Replace hardcoded cards with `apiClient.today(childId)`; render real `MissionOccurrenceDto`s with loading/empty/error states.
- **Backend dependency — resolved.** `POST /devices/claim` now returns `childProfileId` and `childDisplayName` in the response body (alongside the token pair), so the app can call `today(childId)` immediately after pairing without decoding the JWT. See [../features/auth-and-pairing.md](../features/auth-and-pairing.md).

**Implemented 2026-06-22.** The child today screen now loads real data:

- `AuthResponse` carries the optional `childProfileId`/`childDisplayName` from claim; `SessionStore.saveTokens(...)` persists `childProfileId` so the app can call `today(childId)` after pairing.
- `MissionOccurrenceDto` gained the nested `template { title, scheduledTime }` returned by the API.
- `ChildTodayScreen` replaces the two hardcoded `MissionCard`s with a `LaunchedEffect`-driven fetch over `TodayState` (`Loading` → spinner, `Error` → message + Retry, `Loaded` → real cards or an "All clear" empty state). `statusLabel(...)` maps each `MissionStatus` to a child-friendly label.
- Done/Snooze/Talk remain stubbed (Phase 2).
- **Verified end-to-end (2026-06-22):** `./gradlew :app:compileDebugKotlin` succeeds; the live `claim`/`today` responses deserialize cleanly into the new DTOs; and on the emulator a fresh pairing renders two real mission cards (title, `scheduledTime`, and "Scheduled" status) loaded from `today(childId)`.

**Note on upgrading an existing install:** a device paired by a pre-Phase-1 build has a token but no persisted `childProfileId`, so the new build shows the "Missing child profile. Re-pair this device." error card until the session is cleared and re-paired. (A migration/JWT-decode fallback could smooth this, but re-pairing is acceptable for now.)

## Phase 2 — Mission actions

- Wire Done → `POST /mission-occurrences/:id/done`, Snooze → `/snooze`, Talk → open chat.
- Wire the same three actions in `AlarmActivity` (the buttons currently only close the screen).

**Implemented 2026-06-22.**

- `ApiClient` gained `markDone(id)` and `snooze(id, minutes)`, plus an `orThrow()` helper that turns non-2xx responses into a typed `ApiException` (ktor's default `expectSuccess = false` otherwise swallows them). `MissionTemplateDto` now carries `snoozePolicy { allowed, defaultMinutes, allowedMinutes }` (defaulted) so the card snoozes with an allowed duration. `done`/`snooze` responses omit the template, so the client fires-and-refreshes (`today()`) rather than reading them back.
- `MissionCard` runs Done/Snooze in a coroutine with per-card busy + inline message state; a successful action bumps `reloadKey` to refetch. Snooze surfaces the backend decision (`approved` → "Snoozed N min", else the denial `reason`). **Talk** seeds the (lifted) chat draft with `About "<title>": ` and scrolls the list to the chat panel.
- `AlarmActivity` wires the same Done/Snooze via `ApiClient` (falling back to a 10-min snooze since it has no template); **Talk** launches `MainActivity`. Done/approved-snooze close the alarm; failures stay open with a message.
- **Verified end-to-end on the emulator (2026-06-22):** Done on a `tap_done` mission → `completed` + coins; Done on an empty-proof-policy mission correctly surfaces the API 400 ("Proof type is not accepted"); Snooze on a `notified` mission → `snoozed` (approved 10 min); Talk seeds the chat draft and scrolls. `AlarmActivity` is `exported=false` so its actions were verified by compile + code parity, not adb (same as the Phase 0 note).

## Phase 3 — Chat + confirm cards

- Real thread create/list, send message, render the OpenClaw response.
- Show a **Confirm card** when a response carries an action draft → `POST /action-drafts/:id/confirm` | `/reject`.

## Phase 4 — Parent mode

- Parent bootstrap/login UI.
- Wire "Generate Code" → `POST /devices/pairing-codes` (display the code; optionally a QR).
- Real children list, coins, alerts.

## Phase 5 — Real device + resilience

- 401 → refresh-token flow.
- Real phone on LAN: `./gradlew :app:assembleDebug -PFAMILY_MANAGER_DEBUG_API_BASE_URL=http://<lan-ip>:4000/api`.
- Runtime permission prompts: notifications (Android 13+), exact alarm, full-screen intent.
- Boot-time alarm rescheduling (`BootReceiver`). (Room cache stays a roadmap item.)

## Push testing

Real FCM needs a Firebase project; alarm-UI testing is decoupled from it (trigger `AlarmActivity` via `adb`). See the push testing strategy in [../testing.md](../testing.md).

---

## Phase 0 current-state assessment

_Run on 2026-06-13 (local Mac, branch `docs/system-android-bringup-bridge-spec`)._

### Backend — verified working (strong evidence)

Postgres was already running (`family-manager-postgres-1` on host `5433`); migrations reported up to date. The API was started with `pnpm --filter @family-manager/api start` and a local `JWT_SECRET`.

- Smoke check: `GET /api/children` → `401 Unauthorized` (`Missing bearer token`). ✅
- Full pairing flow exercised via curl/HTTP:
  - `POST /auth/parent/bootstrap` → `201`, returns `{accessToken, refreshToken, user}`.
  - `POST /auth/login` → `201`.
  - `POST /children` (parent token) → `201`, returns the child profile incl. `id`.
  - `POST /devices/pairing-codes` (parent token) → `201`, returns `{code, childProfileId, expiresAtMinutes}`.
  - `POST /devices/claim` (no auth, with code) → `201`, returns `{accessToken, refreshToken, user}`.
  - `GET /children/:childId/missions/today` (child token) → `200`, `0` occurrences (none scheduled yet).

**Confirmed gap (drove Phase 1) — now resolved:** the `claim` response body originally did **not** include `childProfileId` (it was only inside the child JWT), so an Android client could not call `today(childId)` after pairing without decoding the JWT. The claim response now returns `childProfileId` and `childDisplayName` directly. See [../features/auth-and-pairing.md](../features/auth-and-pairing.md).

### Android — verified on emulator (2026-06-21)

The app now builds, installs, and pairs end-to-end against the local API on an emulator (Android Studio, "Medium Phone" AVD). Getting there required four fixes, all committed:

1. **Gradle wrapper** — `apps/android` had none. Generated on first Android Studio sync and committed (`gradlew`, `gradlew.bat`, `gradle/wrapper/`), so the CLI build is now bootstrappable.
2. **`gradle.properties`** was missing entirely → builds failed with "AndroidX dependencies but `android.useAndroidX` not enabled". Added with `android.useAndroidX=true` (plus standard JVM/Kotlin defaults).
3. **JVM-target mismatch** (Java 1.8 vs Kotlin 21) → pinned both to JVM 17 (`compileOptions` + `kotlinOptions.jvmTarget`) in `app/build.gradle.kts`.
4. **Google Services plugin** made `google-services.json` a hard build requirement, contradicting the "FCM optional locally" design. The plugin is now applied only when the file exists; the runtime FCM call in `MainActivity` is wrapped so a missing Firebase config can't flip a successful pairing into a failure.

**Pairing bug found and fixed (client serialization):** the first on-device pairing attempts failed with `Pairing failed`. Root cause: kotlinx serialization defaults `encodeDefaults = false`, so the ktor client dropped `ClaimDeviceRequest.platform` (default `"android"`) from the request body; the API requires `platform` (`Device.platform` is a non-null column), so the insert 500'd and the transaction rolled back. The error surfaced in-app as a `JsonConvertException` because ktor's default `expectSuccess = false` tried to parse the 500 error body as an `AuthResponse`. Fixed by setting `encodeDefaults = true` on the client `Json`. After the fix, pairing succeeds and a `Device` row is created.

**Server-side follow-up (not blocking):** the API returned a raw `500` for the missing required field instead of a clean `400`. This is the known "no DTO validation yet" gap — see [roadmap.md](roadmap.md) (API hardening) and [../features/auth-and-pairing.md](../features/auth-and-pairing.md).

Not yet exercised on-device: `AlarmActivity` strong-reminder UI (note: it is `android:exported="false"`, so a plain `adb am start` is rejected — trigger it via its normal alarm path or temporarily mark it exported in a debug build).

### Net "where it stands"

Backend pairing/auth/missions path works locally, and the Android app now builds and pairs against it on an emulator. Phase 0 is complete. Phase 1 (real today screen) is unblocked: the claim response already returns `childProfileId`/`childDisplayName`, and the client serialization fix means API requests carry their full bodies.
