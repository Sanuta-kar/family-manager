# Development Handoff

This document captures the current implementation state so development can continue on the VPS without relying on chat history.

## Current Git State

- Repository initialized in `/Users/annakukuy/private/family-manager`.
- First commit created:
  - `1ae2288 docs: add initial family mission app spec`
- The current work should be committed as the second commit after this document is added.

## What Was Implemented

### Documentation

- `docs/spec.md` contains the accepted V1 product and architecture specification.
- `docs/architecture.md` describes the runtime topology and authority boundaries.
- `README.md` describes the workspace layout and basic local backend startup commands.

### Monorepo Scaffold

Created a pnpm workspace with:

- `apps/api` - NestJS/Fastify API service.
- `apps/worker` - BullMQ worker service.
- `apps/openclaw-adapter` - internal HTTP adapter between the backend and OpenClaw.
- `apps/android` - native Android Kotlin/Compose project shell.
- `packages/shared` - shared TypeScript contracts and enums.
- `infra/docker` - Docker Compose and Caddy deployment files.

Root files added:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.editorconfig`
- `.env.example`
- `.gitignore`

### Shared Contracts

`packages/shared/src/index.ts` defines the core cross-service types:

- Roles: `parent`, `child`
- Mission statuses: `scheduled`, `notified`, `snoozed`, `proof_pending`, `parent_review`, `completed`, `failed`, `cancelled`
- Chat action draft statuses: `drafted`, `confirmed`, `rejected`, `expired`, `invalid`
- Proof, snooze, reward, OpenClaw request, and OpenClaw response contracts

These contracts are intentionally simple and should become the basis for OpenAPI/Android DTO generation later.

### Backend API Scaffold

`apps/api` contains a NestJS API using Fastify, Prisma, JWT auth, and module boundaries for:

- Auth
- Children
- Devices
- Missions
- Chat
- OpenClaw
- Alerts
- Coins

Implemented API behavior includes:

- Parent bootstrap with initial family, parent user, and default OpenClaw personality preset.
- Parent login and JWT refresh flow.
- Child profile creation with matching child user.
- One-time child device pairing code generation and claim flow.
- FCM token registration for paired child devices.
- Mission template creation and update.
- Today mission occurrence listing.
- Snooze request validation against configured snooze policy.
- Done/proof submission and proof-state evaluation.
- Parent review approve/reject flow.
- Coin ledger award on approved/completed missions.
- Parent alert listing and update.
- Backend-stored chat threads/messages.
- OpenClaw chat response storage.
- Chat-originated schedule changes stored as `chat_action_drafts`.
- Explicit confirmation required before a chat action draft mutates missions.
- Child RBAC guardrails:
  - child can access only own child profile
  - child can create only own unprotected reminders
  - child cannot create protected missions
  - child cannot confirm a draft for another user

Important current limitation: the API code is scaffold-quality and has not yet been dependency-installed or typechecked in this local environment.

### Prisma Data Model

`apps/api/prisma/schema.prisma` defines the V1 schema:

- `families`
- `users`
- `child_profiles`
- `devices`
- `device_pairing_codes`
- `mission_templates`
- `mission_occurrences`
- `snooze_events`
- `proof_submissions`
- `alerts`
- `coin_ledger`
- `chat_threads`
- `chat_messages`
- `chat_action_drafts`
- `agent_personality_presets`
- `agent_audit_logs`

The schema encodes the main V1 authority model: backend-owned state, immutable coin ledger entries, persisted chat history, and confirmable OpenClaw action drafts.

### Worker Scaffold

`apps/worker` contains a BullMQ worker with two initial jobs:

- `notify-occurrence`
  - marks a scheduled occurrence as `notified`
  - sets a deadline
  - schedules a `mark-missed` job
- `mark-missed`
  - marks the occurrence as `failed`
  - creates a parent-facing alert

Important current limitation: FCM delivery is not implemented yet; the worker logs notification intent and owns the timing boundary.

### OpenClaw Adapter Scaffold

`apps/openclaw-adapter` is a Fastify service exposing:

- `GET /health`
- `POST /chat`

It can call `OPENCLAW_BASE_URL` when configured. If OpenClaw is unavailable, it uses a deterministic fallback parser for messages like:

```text
Remind me to practice piano every day at 18:00
```

The adapter returns structured responses only and sanitizes unsupported action drafts. It does not receive database write credentials and cannot mutate app state directly.

### Android Scaffold

`apps/android` contains a native Android Kotlin project with:

- Jetpack Compose shell UI.
- Parent/child mode toggle.
- Child today screen with sample mission cards.
- OpenClaw chat panel placeholder.
- Parent dashboard placeholder.
- Android manifest permissions for:
  - internet
  - notifications
  - exact alarms
  - full-screen intent
  - camera
  - fine/background location
  - boot completed
- `AlarmActivity` for full-screen strong reminder UX.
- `MissionAlarmReceiver` to open alarm screen.
- `BootReceiver` placeholder for local alarm rescheduling after reboot.
- `MissionAlarmScheduler` using `AlarmManager.setAlarmClock`.
- `FamilyMessagingService` FCM token/message hooks.
- `ApiClient` Ktor client stub for bootstrap, today missions, and chat messages.

Important current limitation: the Android app is a shell and has not yet been compiled locally because Gradle/Android dependency resolution is not available in this environment.

### Docker Infrastructure

`infra/docker/docker-compose.yml` defines:

- `reverse-proxy` with Caddy
- `api`
- `worker`
- `openclaw-adapter`
- `openclaw`
- `postgres`
- `redis`

The `openclaw` image is currently a placeholder:

```yaml
image: openclaw/openclaw:latest
```

Replace this with the actual OpenClaw container/image/config already running on the Hostinger VPS, or attach the adapter to the existing Docker network.

## What Was Verified Locally

Verified:

- Git repository initialized.
- Initial spec commit exists.
- Package JSON files are valid JSON.
- Current source tree and file layout are present.

Not verified locally:

- `pnpm install`
- TypeScript compilation
- Prisma client generation
- Prisma migration
- Docker build
- Android Gradle build

Reason: local sandbox does not have `pnpm` or `gradle`; Corepack needs to create cache files outside the writable workspace, and network/dependency resolution was not approved in this environment.

## How To Continue On The VPS

### 1. Copy Or Push The Repository

Preferred: push this repo to a private Git remote, then clone it on the VPS.

Alternative: copy the whole repository directory to the VPS with `rsync` or `scp`.

Make sure the VPS copy includes:

- `.git`
- `docs`
- `apps`
- `packages`
- `infra`
- root config files

### 2. Prepare VPS Tooling

Install or confirm:

- Node.js 22 LTS or a compatible recent Node 22 build
- Corepack
- Docker
- Docker Compose plugin
- Java 17 and Android SDK only if building Android APKs on the VPS

Then from the repo root:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
```

### 3. Configure Environment

Copy:

```bash
cp .env.example .env
```

Set real values:

- `PUBLIC_API_BASE_URL`
- `JWT_SECRET`
- `FCM_SERVICE_ACCOUNT_JSON`
- `OPENCLAW_BASE_URL` or Docker network settings
- `PROOF_STORAGE_PATH`

Change default PostgreSQL credentials before exposing the VPS.

### 4. Generate Prisma Client And Create Migration

From repo root:

```bash
pnpm --filter @family-manager/api prisma:generate
pnpm --filter @family-manager/api prisma:migrate
```

If this is the first real database migration, name it clearly, for example:

```bash
pnpm --filter @family-manager/api prisma migrate dev --name init_family_mission_schema
```

### 5. Verify TypeScript Services

Run:

```bash
pnpm -r typecheck
pnpm -r build
```

Fix any TypeScript, Prisma enum, import, or Dockerfile issues found by the first real dependency-backed build.

### 6. Start Backend Stack

Run:

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

Then verify:

- Caddy starts.
- API listens on port `4000` inside Docker.
- OpenClaw adapter health endpoint responds.
- API can reach PostgreSQL, Redis, and OpenClaw adapter.

### 7. Connect The Real OpenClaw Container

Decide one of:

- Replace the placeholder `openclaw` service in `docker-compose.yml` with the real image/config.
- Remove the placeholder service and connect `openclaw-adapter` to the existing OpenClaw Docker network.

After that, confirm:

```bash
curl http://openclaw-adapter:4010/health
```

from inside the Docker network, and test `POST /chat` through the API.

## Recommended Next Development Steps

### Backend

1. Run first dependency-backed typecheck and fix compile issues.
2. Add DTO validation with `class-validator` or Zod.
3. Add OpenAPI generation.
4. Add password reset/change support for parent.
5. Add refresh-token persistence/revocation.
6. Add proper FCM push service.
7. Add proof file upload storage and metadata write path.
8. Add mission recurrence expansion beyond the current single next occurrence.
9. Add scheduler jobs when mission templates are created.
10. Add integration tests for:
    - parent bootstrap
    - child creation
    - device pairing
    - protected mission RBAC
    - child-owned reminder flow
    - chat draft confirmation
    - coin award idempotency

### OpenClaw

1. Replace fallback parser with the real OpenClaw API contract.
2. Keep adapter output strictly structured.
3. Add schema validation for OpenClaw responses.
4. Add audit-log detail for rejected or sanitized OpenClaw actions.
5. Add per-user/personality preset loading from the backend context.

### Android

1. Add Gradle wrapper or build through Android Studio.
2. Compile the current Android shell and fix dependency/API issues.
3. Add persistent auth/token storage.
4. Implement parent bootstrap/login UI.
5. Implement device pairing UI.
6. Replace sample missions with API-backed today mission sync.
7. Add Room entities for cached missions and outbound sync queue.
8. Wire Done/Snooze/Talk buttons to API calls.
9. Register FCM token with backend.
10. Implement boot-time alarm rescheduling from Room.
11. Add photo proof capture using CameraX.
12. Add geofence proof tracking for dog-walk missions.

### Deployment

1. Replace `family.example.com` in `infra/docker/Caddyfile`.
2. Replace database passwords and secrets.
3. Add persistent volume backup for PostgreSQL and proof storage.
4. Add basic monitoring/log retention.
5. Keep API private until auth, TLS, and FCM config are validated.

## Known Risks And Gaps

- The current code has not been compiled with installed dependencies.
- Prisma migration files have not been generated yet.
- FCM push delivery is not implemented.
- Android UI is a scaffold, not a complete product flow.
- Android exact alarm/background location behavior must be tested on real devices.
- The OpenClaw Docker image/config is a placeholder and must be aligned with the actual VPS setup.
- Chat history is stored fully on backend by design; this is useful for parent safety/audit but should be treated as sensitive data.
- Phone/app blocking is intentionally not implemented in V1.

## Suggested Commit Sequence After This Handoff

After the current scaffold commit:

1. `fix: make backend compile after dependency install`
2. `feat(api): add validated auth and pairing flows`
3. `feat(api): add mission recurrence scheduling jobs`
4. `feat(api): add fcm push service`
5. `feat(android): add auth and device pairing`
6. `feat(android): sync today missions and schedule alarms`
7. `feat(android): add chat and confirm cards`
8. `feat(android): add proof capture and upload`

