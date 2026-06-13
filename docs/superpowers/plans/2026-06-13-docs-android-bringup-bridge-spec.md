# Documentation System, Android Bring-Up, and Device Action Bridge Spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the project's documentation into a single-source-of-truth system (LLM-oriented `docs/` + human READMEs + `CLAUDE.md`/`AGENTS.md`), write up the Android bring-up plan and run the Phase 0 baseline, and capture the Device Action Bridge as spec-only documentation.

**Architecture:** Documentation is authored under `docs/` as canonical content; root `README.md`, per-app READMEs, and `docs/guides/` are thin human surfaces that link into `docs/`; `CLAUDE.md` is the agent entry point and `AGENTS.md` is a committed symlink to it. No application/bridge code is written except the Phase 0 Android baseline (build, run on emulator, smoke test, write a current-state assessment).

**Tech Stack:** Markdown docs; existing pnpm monorepo (NestJS API, BullMQ worker, Fastify OpenClaw adapter, Kotlin/Compose Android); Docker Compose; Android SDK/Gradle for Phase 0.

**Source spec:** `docs/superpowers/specs/2026-06-13-documentation-android-bringup-device-bridge-design.md`

**Conventions for every doc task:**
- Paths are **relative to repo root**. Never hardcode a developer home path. The only absolute path allowed anywhere is the VPS path `/srv/fm/family-manager`, and only in `docs/deployment.md`.
- After writing/editing a doc, verify there are no stale references (see the repeated verification step) and commit.
- Do not restate facts that live in `docs/`; link to them instead.

---

## Phase A — Documentation system

### Task A1: Agent entry point (`CLAUDE.md` + `AGENTS.md` symlink)

**Files:**
- Create: `CLAUDE.md`
- Create (symlink): `AGENTS.md` -> `CLAUDE.md`

- [ ] **Step 1: Write `CLAUDE.md`** with these sections, filled from real facts:
  - **Project map** — table of `apps/api`, `apps/worker`, `apps/openclaw-adapter`, `apps/telegram-codex`, `apps/android`, `packages/shared`, `infra/docker`, one line each.
  - **Tech stack** — NestJS/Fastify + Prisma + Postgres; BullMQ worker + Redis; Fastify OpenClaw adapter; Kotlin/Jetpack Compose Android; Docker Compose.
  - **Conventions** — repo-relative paths only; never hardcode a home path; canonical docs live in `docs/`, humans read READMEs + `docs/guides/`.
  - **Build / test commands** — `corepack prepare pnpm@9.15.0 --activate`; `pnpm install --frozen-lockfile`; `pnpm --filter @family-manager/api prisma:generate`; `pnpm -r typecheck`; `pnpm -r test`; `pnpm -r build`; per-app `dev:*` scripts from root `package.json`.
  - **Local run** — Postgres on host `5433` via `docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres`; `pnpm --filter @family-manager/api exec prisma migrate deploy`; `pnpm --filter @family-manager/api start`; API at `http://localhost:4000/api`; smoke: `curl -i http://localhost:4000/api/children` → `401 Missing bearer token`.
  - **Current status** — bulleted real state (API/worker/adapter real; Android child pairing real but mission cards/buttons stubbed; FCM optional locally; OpenClaw uses adapter fallback locally). Link to `docs/` feature files for detail.
  - **Where to find things** — link list to `docs/spec.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/testing.md`, `docs/features/`, `docs/plans/`, `docs/guides/`.
  - **Paths** — local dir differs from VPS `/srv/fm/family-manager` by design; see `docs/deployment.md`.

- [ ] **Step 2: Create the `AGENTS.md` symlink**

```bash
cd /Users/annakukuy/private/fm/family-manager
ln -s CLAUDE.md AGENTS.md
```

- [ ] **Step 3: Verify the symlink resolves and is tracked as a symlink**

```bash
ls -l AGENTS.md            # expect: AGENTS.md -> CLAUDE.md
git add CLAUDE.md AGENTS.md
git ls-files -s AGENTS.md  # expect mode 120000 (symlink)
```
Expected: `ls -l` shows the arrow; `git ls-files -s` shows mode `120000`.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: add CLAUDE.md agent entry point and AGENTS.md symlink"
```

---

### Task A2: Feature docs (`docs/features/*.md`)

Extract implemented-state facts from the code and the (about-to-be-retired) `development-handoff.md` into one file per capability. Each file uses the same headers: **Purpose / Data model / API / Current state / Gaps**.

**Files:**
- Create: `docs/features/missions.md`
- Create: `docs/features/auth-and-pairing.md`
- Create: `docs/features/chat-and-drafts.md`
- Create: `docs/features/push-notifications.md`

- [ ] **Step 1: Write `docs/features/auth-and-pairing.md`**
  - Purpose: parent bootstrap/login/refresh; one-time child device pairing with scoped child JWTs.
  - Data model: `families`, `users`, `child_profiles`, `devices`, `device_pairing_codes`.
  - API: `POST /auth/parent/bootstrap`, `POST /auth/login`, `POST /auth/refresh`, `POST /devices/pairing-codes`, `POST /devices/claim`, `POST /devices/fcm-token`. Source: `apps/api/src/modules/devices/devices.service.ts`, `.../auth`.
  - Current state: real. Pairing code is SHA-256 hashed, 15-min default expiry. Access token 15 min, refresh 30 days.
  - **Gaps (record exactly):** `claim` returns only the token pair; `childProfileId` is encoded in the JWT but **not** returned in the response body, so the Android client cannot directly call `today(childId)` without decoding the JWT or a new endpoint. Candidate fix: add `childProfileId` to the claim response or add `GET /me`. (Referenced by the Android bring-up plan, Phase 1.)

- [ ] **Step 2: Write `docs/features/missions.md`**
  - Purpose: parent-protected missions + child reminders; templates expand to occurrences; proof + coins.
  - Data model: `mission_templates`, `mission_occurrences`, `snooze_events`, `proof_submissions`, `coin_ledger`, `alerts`. Statuses: `scheduled, notified, snoozed, proof_pending, parent_review, completed, failed, cancelled`.
  - API: `POST /mission-templates`, `PATCH /mission-templates/:id`, `GET /children/:childId/missions/today`, `POST /mission-occurrences/:id/{snooze,done,proofs,parent-review}`, `GET /coins`, `GET /alerts`, `PATCH /alerts/:id`.
  - Current state: real. Proof validation per type (`tap_done` requires `tappedAt`; `photo` requires stored upload ref; `geofence_exit` validates coordinates/distance; `parent_review` cannot be self-submitted). Coin award idempotent via unique `CoinLedger.occurrenceId` (migration `20260613120000_unique_coin_occurrence`). Occurrences scheduled in the child profile timezone.
  - Gaps: no DTO validation library; no proof file storage path yet; no API tests.

- [ ] **Step 3: Write `docs/features/chat-and-drafts.md`**
  - Purpose: in-app OpenClaw chat; chat-originated schedule changes become confirmable drafts; OpenClaw never mutates state.
  - Data model: `chat_threads`, `chat_messages`, `chat_action_drafts`, `agent_personality_presets`, `agent_audit_logs`. Draft statuses: `drafted, confirmed, rejected, expired, invalid`.
  - API: `GET/POST /chat/threads`, `GET/POST /chat/threads/:id/messages`, `POST /action-drafts/:id/{confirm,reject}`.
  - OpenClaw contract: backend sends role/child context, recent history, schedule context, `allowedActions`, policy limits; adapter returns `messageText`, optional `actionDraft`, optional `snoozeDecision`, `safetyFlags`; adapter **sanitizes** any `actionDraft` not in `allowedActions`. Source: `apps/openclaw-adapter/src`, `apps/api/src/modules/chat`, `packages/shared`.
  - Current state: real wiring; local fallback parser matches `remind me to <X> (every day|daily) at HH:MM`.
  - Gaps: fallback is regex-only; no schema validation of real OpenClaw responses yet.

- [ ] **Step 4: Write `docs/features/push-notifications.md`**
  - Purpose: worker schedules occurrences and notifies devices via FCM.
  - Worker jobs: `expand-occurrences` (startup + every 5 min, 7-day horizon), `notify-occurrence` (marks `notified`, 15-min deadline, enqueues `mark-missed`, sends FCM), `mark-missed` (marks `failed`, creates alert; respects snooze postponements). Source: `apps/worker/src`.
  - FCM: worker reads `FCM_SERVICE_ACCOUNT_JSON`, mints OAuth JWT, posts to FCM v1; **skips silently** if unconfigured. Android `FamilyMessagingService` registers tokens and launches `AlarmActivity` on `mission_reminder` pushes.
  - Current state: real; worker has scheduling + push tests.
  - Gaps: end-to-end FCM untested without a Firebase project (see `docs/testing.md` push strategy).

- [ ] **Step 5: Verify no stale paths, then commit**

```bash
cd /Users/annakukuy/private/fm/family-manager
grep -rn "Users/annakukuy/private/family-manager" docs/features && echo "STALE PATH FOUND" || echo "clean"
git add docs/features
git commit -m "docs: add per-feature documentation from current implementation"
```
Expected: `clean`.

---

### Task A3: `docs/deployment.md`

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Write `docs/deployment.md`** with:
  - **VPS layout** — repo at `/srv/fm/family-manager`; the OpenClaw container runs alongside it on the same host/Docker network.
  - **Compose** — services from `infra/docker/docker-compose.yml`: `reverse-proxy` (caddy), `api` (`:4000`), `worker`, `openclaw-adapter` (`:4010`), `postgres` (host `5433`), `redis`, and the optional `openclaw` placeholder behind the `openclaw` profile. Note `api` env `OPENCLAW_ADAPTER_URL=http://openclaw-adapter:4010`.
  - **Connecting real OpenClaw** — replace the placeholder `openclaw` image or attach `openclaw-adapter` to the existing OpenClaw Docker network; set `OPENCLAW_BASE_URL`; verify with `curl http://openclaw-adapter:4010/health` from inside the network.
  - **Secrets** — `JWT_SECRET`, `FCM_SERVICE_ACCOUNT_JSON`, Postgres credentials, `PROOF_STORAGE_PATH`; from `.env.example`. State that defaults must be replaced before exposing the VPS.
  - **Path note** — this file is the single place the absolute VPS path appears.

- [ ] **Step 2: Verify and commit**

```bash
git add docs/deployment.md
git commit -m "docs: add deployment doc with VPS topology and OpenClaw wiring"
```

---

### Task A4: `docs/testing.md` (canonical testing reference)

Migrate the durable content of `local-development-testing.md` into the canonical testing doc (the file itself is retired in Task A9).

**Files:**
- Create: `docs/testing.md`

- [ ] **Step 1: Write `docs/testing.md`** with:
  - **Local backend** — the command block from `local-development-testing.md` (corepack/pnpm/prisma/compose-postgres/migrate/start); API at `http://localhost:4000/api`; smoke `curl -i http://localhost:4000/api/children` → `401 Missing bearer token`.
  - **Verification commands** — `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build`; migration status command. Note API has no tests (`--passWithNoTests`); worker has scheduling + push tests.
  - **Manual API flow** — the 13-step flow (bootstrap → child → pairing code → claim → mission → today → done/proof → invalid-proof rejection → coin-once → chat thread → reminder draft → confirm → scheduled).
  - **Emulator** — `http://10.0.2.2:4000/api`; debug cleartext enabled; override via Gradle property `FAMILY_MANAGER_DEBUG_API_BASE_URL`.
  - **Real device** — LAN IP example `http://192.168.1.41:4000/api`; `assembleDebug -PFAMILY_MANAGER_DEBUG_API_BASE_URL=...`.
  - **Push testing strategy (decision)** — decouple: trigger `AlarmActivity` via `adb` intent to test alarm UX without push; treat real FCM (needs Firebase project + `google-services.json` + `FCM_SERVICE_ACCOUNT_JSON`) as its own checklist item.
  - **Bridge simulation** — link to `docs/features/device-action-bridge.md`; summarize the three seams (adapter fallback draft, virtual-device CLI harness, emulator mock handler + companion stub app).
  - **Known local blockers** — Docker Hub pulls hang for uncached images (`redis:7-alpine`, `node:22-alpine`, `caddy:2.8`); Postgres `5433` because another project uses `5432`.

- [ ] **Step 2: Verify and commit**

```bash
git add docs/testing.md
git commit -m "docs: add canonical testing reference"
```

---

### Task A5: Human guides (`docs/guides/*.md`)

**Files:**
- Create: `docs/guides/using-the-assistant.md`
- Create: `docs/guides/testing-walkthrough.md`

- [ ] **Step 1: Write `docs/guides/using-the-assistant.md`** (human, minimal jargon)
  - What the in-app assistant is (the family-facing OpenClaw chat); parent vs child personalities.
  - How to chat; that it can **draft** reminders/changes but nothing happens until you tap **Confirm**.
  - Example: "Remind me to practice piano every day at 18:00" → Confirm card.
  - Safety note: parents can see chat history for safety/audit.
  - Explicitly: this is **not** the Telegram-Codex bridge (that is a developer tool; see `apps/telegram-codex/README.md`).

- [ ] **Step 2: Write `docs/guides/testing-walkthrough.md`** (human, step-by-step)
  - Start backend (link to `docs/testing.md`).
  - Open `apps/android` in Android Studio, run on emulator.
  - Generate a pairing code via API, claim it in the app, see it pair.
  - Trigger the alarm screen via `adb` (link to `docs/testing.md` push strategy).
  - Where to report what worked / what didn't.

- [ ] **Step 3: Verify and commit**

```bash
git add docs/guides
git commit -m "docs: add human guides for assistant usage and testing walkthrough"
```

---

### Task A6: Expand `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add a "Deployment topology" subsection** — VPS host runs the Compose stack and the OpenClaw container on a shared network; link to `docs/deployment.md`. Keep the existing mermaid diagram; add the OpenClaw container relationship if not already explicit.

- [ ] **Step 2: Add a "Device Action Bridge flow" subsection** — short prose + a sequence list: OpenClaw draft → server validate/policy → `device_commands` (pending) → FCM ping → device REST pull → handler executes → result POST → audited → fed back to OpenClaw. Link to `docs/features/device-action-bridge.md` for detail (do not duplicate the full spec).

- [ ] **Step 3: Verify and commit**

```bash
git add docs/architecture.md
git commit -m "docs: expand architecture with deployment topology and bridge flow"
```

---

### Task A7: READMEs (root + per-app)

**Files:**
- Modify: `README.md`
- Create: `apps/android/README.md`
- Create: `apps/api/README.md`
- Modify: `apps/telegram-codex/README.md` (create if absent)

- [ ] **Step 1: Rewrite root `README.md` thin** — one-paragraph what-it-is; a 5-line quick start linking to `docs/testing.md`; a links section to `CLAUDE.md` and the `docs/` map; a short **Developer tools** subsection that points to `apps/telegram-codex/README.md` for the Codex bridge. Remove the long Telegram instructions from the root (they move to the telegram-codex README).

- [ ] **Step 2: Write `apps/api/README.md`** — thin: prereqs, `prisma:generate`, run `pnpm --filter @family-manager/api start`, link to `docs/testing.md` and `docs/features/`.

- [ ] **Step 3: Write `apps/android/README.md`** — thin: open in Android Studio, generate the Gradle wrapper if missing (see Phase 0), emulator base URL `http://10.0.2.2:4000/api`, real-device Gradle property; link to `docs/plans/android-bring-up.md` and `docs/testing.md`.

- [ ] **Step 4: Write/replace `apps/telegram-codex/README.md`** — move the Telegram bridge instructions here from the old root README; clearly label it a **developer tool**, not a family feature.

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/annakukuy/private/fm/family-manager
grep -rn "Users/annakukuy/private/family-manager" README.md apps/*/README.md && echo "STALE" || echo "clean"
git add README.md apps/android/README.md apps/api/README.md apps/telegram-codex/README.md
git commit -m "docs: thin root README + per-app READMEs; move Telegram bridge to dev README"
```
Expected: `clean`.

---

### Task A8: `docs/plans/roadmap.md`

**Files:**
- Create: `docs/plans/roadmap.md`

- [ ] **Step 1: Write `docs/plans/roadmap.md`** — consolidate the scattered "next steps" from `development-handoff.md` and `local-development-testing.md` into phases:
  - **Now:** docs system (this plan), Android Phase 0 baseline.
  - **Next:** Android bring-up Phases 1–5 (link `docs/plans/android-bring-up.md`); API DTO validation + integration tests; proof upload storage.
  - **Then:** Device Action Bridge implementation (link `docs/plans/device-action-bridge-plan.md`).
  - **Later (hardening):** real OpenClaw connection, secrets rotation, FCM service account, Postgres backup/restore, monitoring.
  - Each item one line; link rather than restate.

- [ ] **Step 2: Verify and commit**

```bash
git add docs/plans/roadmap.md
git commit -m "docs: add consolidated phased roadmap"
```

---

### Task A9: Retire stale docs

Do this **after** A2/A3/A4 have absorbed the content, so nothing is lost.

**Files:**
- Delete: `docs/development-handoff.md`
- Delete: `docs/local-development-testing.md`

- [ ] **Step 1: Confirm content is migrated** — verify the implemented-state facts now live in `docs/features/` + `CLAUDE.md`, the VPS/continue content in `docs/deployment.md`, and the testing content in `docs/testing.md`.

- [ ] **Step 2: Grep for inbound references and update them**

```bash
cd /Users/annakukuy/private/fm/family-manager
grep -rn "development-handoff\|local-development-testing" --include=*.md . | grep -v "docs/superpowers/"
```
Expected: only references that you will update to point at the new docs (e.g. root README). Update any found, except inside `docs/superpowers/` (historical spec/plan records — leave those).

- [ ] **Step 3: Delete and commit**

```bash
git rm docs/development-handoff.md docs/local-development-testing.md
git add -A
git commit -m "docs: retire stale handoff and local-testing docs (content migrated)"
```

---

## Phase B — Device Action Bridge spec (docs only)

### Task B1: `docs/features/device-action-bridge.md`

**Files:**
- Create: `docs/features/device-action-bridge.md`

- [ ] **Step 1: Write the feature spec** — transcribe Section 3 of the design spec into the feature-doc format. Required content (no omissions):
  - **Purpose & constraints** — OpenClaw on VPS has no path to a phone except the server; Android sandboxes apps; the family-manager app is the on-device agent.
  - **Authority model** — reuse advisory → draft → validate → confirm, pointed at the device.
  - **Three layers** — OpenClaw capability contract (extends `allowedActions`/`ChatActionType`); server command bus (outbox/inbox); Android capability-handler registry.
  - **Data model** — `device_commands` (`id, deviceId, childProfileId, capabilityType, params, status[pending|dispatched|completed|failed|rejected|expired], requiresConfirmation, confirmedBy, originDraftId, createdAt, expiresAt`) and `device_command_results` (`id, commandId, status, payload, error, receivedAt`); per-device advertised capabilities + per-capability grant at registration.
  - **Transport/flow** — the 6-step FCM-ping + REST-pull loop; REST is source of truth; expiry + idempotency by `commandId`; commands scoped to device token.
  - **V1 capabilities (read-only)** — `read_calendar` (`READ_CALENDAR`), `read_app_usage` (`UsageStatsManager`), optional `read_device_state`; typed schemas live in `packages/shared`.
  - **Safety** — per-capability policy (roles, auto-approve vs confirm, data minimization); parent can disable per child; audit via `agent_audit_logs`; OpenClaw only receives declared output.
  - **Testing/simulation** — three seams (adapter fallback draft; virtual-device CLI harness; emulator mock handler + real `read_calendar` + companion stub app) and negative tests.

- [ ] **Step 2: Verify and commit**

```bash
git add docs/features/device-action-bridge.md
git commit -m "docs: add Device Action Bridge feature spec"
```

---

### Task B2: `docs/plans/device-action-bridge-plan.md`

**Files:**
- Create: `docs/plans/device-action-bridge-plan.md`

- [ ] **Step 1: Write the future implementation plan (outline, not code)** — clearly marked **deferred until after Android bring-up**. Ordered phases:
  1. Shared schemas in `packages/shared` (`read_device_context` capability request/response types; `ChatActionType` extension).
  2. Server: `device_commands` + `device_command_results` tables (Prisma migration); endpoints `GET /devices/commands`, `POST /devices/commands/:id/result`; policy + RBAC validation; FCM-ping dispatch.
  3. Virtual-device CLI harness (pairs as child device, polls inbox, returns synthetic results) — the no-phone integration test.
  4. Adapter fallback: emit `read_device_context` draft for a test phrase.
  5. Android: capability-handler registry + mock handler.
  6. Android: real `read_calendar` handler + companion stub app target.
  - Each phase: state files touched and the acceptance test. Note heavyweight control/block capabilities (DeviceAdmin/Accessibility) remain out of scope.

- [ ] **Step 2: Verify and commit**

```bash
git add docs/plans/device-action-bridge-plan.md
git commit -m "docs: add deferred Device Action Bridge implementation plan"
```

---

## Phase C — Android bring-up plan + Phase 0 baseline

### Task C1: `docs/plans/android-bring-up.md`

**Files:**
- Create: `docs/plans/android-bring-up.md`

- [ ] **Step 1: Write the bring-up plan** — transcribe Section 2 of the design spec, with the phases and the two embedded decisions:
  - **Phase 0** — build, emulator at `http://10.0.2.2:4000/api`, launch, pairing smoke test, FCM graceful-degradation check, write a current-state assessment. Note the **missing Gradle wrapper** must be generated first (see Task C2).
  - **Phase 1** — replace hardcoded cards with `apiClient.today(childId)`; **dependency:** `claim` does not return `childProfileId` (it is only inside the JWT) — verify and, if needed, add it to the claim response or add `GET /me`. Link to `docs/features/auth-and-pairing.md` gaps.
  - **Phase 2** — wire Done/Snooze/Talk in `MainActivity` and `AlarmActivity` to `/done`, `/snooze`, chat.
  - **Phase 3** — real chat + Confirm card → `/action-drafts/:id/{confirm,reject}`.
  - **Phase 4** — parent bootstrap/login UI; wire "Generate Code" → `/devices/pairing-codes`; real children/coins/alerts.
  - **Phase 5** — 401 refresh flow; real device on LAN; runtime permissions (notifications 13+, exact alarm, full-screen intent); boot rescheduling. Room cache stays a roadmap item.
  - **Push testing** — link to `docs/testing.md` decision (decouple alarm UI from FCM).

- [ ] **Step 2: Verify and commit**

```bash
git add docs/plans/android-bring-up.md
git commit -m "docs: add Android bring-up plan"
```

---

### Task C2: Phase 0 baseline run + current-state assessment

This is the only task that touches Android tooling. It produces an evidence-based assessment, not feature code. **If the Android toolchain (SDK/Studio) or Docker images are unavailable, record the blocker honestly** in the assessment rather than asserting success.

**Files:**
- Create: `apps/android/gradlew` + wrapper files (generated) — only if generation succeeds.
- Append: a "Phase 0 current-state assessment" section to `docs/plans/android-bring-up.md`.

- [ ] **Step 1: Start the local backend**

```bash
cd /Users/annakukuy/private/fm/family-manager
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start &
```
Verify: `curl -i http://localhost:4000/api/children` → `HTTP/1.1 401` with `Missing bearer token`.

- [ ] **Step 2: Generate the Gradle wrapper (none exists)**

```bash
cd /Users/annakukuy/private/fm/family-manager/apps/android
gradle wrapper --gradle-version 8.7   # requires a system Gradle, or open the project in Android Studio which generates it
```
Expected: `gradlew`, `gradlew.bat`, and `gradle/wrapper/` are created. If neither system Gradle nor Android Studio is available, record this as a blocker and stop after Step 5's assessment.

- [ ] **Step 3: Build the debug APK**

```bash
cd /Users/annakukuy/private/fm/family-manager/apps/android
./gradlew :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL` and an APK under `app/build/outputs/apk/debug/`. Record any SDK/dependency errors verbatim in the assessment.

- [ ] **Step 4: Run on an emulator and smoke-test pairing**
  - Launch an emulator (Android Studio AVD).
  - Install: `./gradlew :app:installDebug` (debug build targets `http://10.0.2.2:4000/api`).
  - In another shell, bootstrap a parent, create a child, and generate a pairing code via the API (use the manual flow in `docs/testing.md`).
  - In the app, enter the code and confirm it pairs (tokens persist; no crash when Firebase/FCM is absent).

- [ ] **Step 5: Write the current-state assessment** — append to `docs/plans/android-bring-up.md` a dated "Phase 0 current-state assessment" section recording, with evidence: did it build? did it launch? did pairing succeed? did FCM degrade gracefully? what is genuinely working vs stubbed on-device? List any blockers (missing SDK, Docker image pulls, etc.) verbatim.

- [ ] **Step 6: Commit**

```bash
cd /Users/annakukuy/private/fm/family-manager
git add apps/android docs/plans/android-bring-up.md
git commit -m "chore(android): add Gradle wrapper and record Phase 0 baseline assessment"
```
(If the wrapper could not be generated, commit only the assessment with the blocker recorded.)

---

## Self-Review (completed by plan author)

- **Spec coverage:** doc layout (A1–A9), path convention (A1/A3 + per-task grep), bot decision (A5/A7), de-staling (A9), architecture expansion (A6), roadmap (A8), bridge spec (B1) + deferred plan (B2), Android bring-up writeup (C1) + Phase 0 run (C2), push-testing decision (A4/C1). AGENTS.md symlink (A1). All present.
- **No-code constraint:** only Task C2 touches Android, and only to build/run and add a wrapper — no feature code. Bridge is docs-only (B1/B2).
- **Placeholder scan:** doc tasks specify required sections + concrete facts and source paths; commands have expected output; the one environment risk (Android toolchain / Docker pulls) is handled by an explicit "record the blocker" instruction rather than a hidden assumption of success.
- **Consistency:** capability/table names, endpoints, ports (`4000`/`4010`/`5433`), and the `childProfileId` gap are stated identically across A2, B1, C1.
