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
- **Backend dependency:** the child token encodes `childProfileId`, but `POST /devices/claim` does **not** return it in the body, so the app needs another way to get it. Verify, then either add `childProfileId` to the claim response or add a small `GET /me`. See [../features/auth-and-pairing.md](../features/auth-and-pairing.md).

## Phase 2 — Mission actions

- Wire Done → `POST /mission-occurrences/:id/done`, Snooze → `/snooze`, Talk → open chat.
- Wire the same three actions in `AlarmActivity` (the buttons currently only close the screen).

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

**Confirmed gap (drives Phase 1):** the `claim` response body does **not** include `childProfileId` — it is only inside the child JWT. An Android client cannot call `today(childId)` after pairing without decoding the JWT or a new endpoint. See [../features/auth-and-pairing.md](../features/auth-and-pairing.md). This is now empirically verified, not just inferred.

### Android — blocked from a headless run (human step required)

- Android Studio is installed (`/Applications/Android Studio.app`) and an Android SDK exists at `~/Library/Android/sdk` (build-tools, platform-tools, platforms, emulator).
- **Blockers:** there is no JDK or `gradle` on the shell `PATH` (only Android Studio's bundled JBR at `…/Contents/jbr/Contents/Home`, not exported), and `apps/android` has **no Gradle wrapper**, so `./gradlew` cannot be bootstrapped from the CLI without first installing/locating a Gradle distribution.
- The emulator pairing test is also an interactive GUI tap-flow, which cannot be driven autonomously here.

**To finish Phase 0 (human, in Android Studio):**
1. Open `apps/android` in Android Studio; let it sync (this generates the Gradle wrapper using its bundled Gradle/JDK).
2. Start an emulator; Run the app (debug build targets `http://10.0.2.2:4000/api`).
3. With the backend running, generate a pairing code (the curl flow above works) and enter it in the app; confirm it pairs and tokens persist, with no crash when Firebase/`google-services.json` is absent.
4. Trigger `AlarmActivity` via an `adb` intent to confirm the strong-reminder UI (see [../testing.md](../testing.md)).
5. Update this section with the on-device results.

### Net "where it stands"

Backend pairing/auth/missions path is genuinely working locally. The Android app's pairing flow is wired against this API, but compiling and running it requires the Android Studio GUI on this machine. No on-device verification was possible headlessly.
