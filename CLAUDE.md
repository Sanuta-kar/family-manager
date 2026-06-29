# CLAUDE.md — Agent Entry Point

This is the entry point for any AI agent (Claude, Codex, etc.) working in this repository. `AGENTS.md` is a symlink to this file. Canonical documentation lives in [docs/](docs/); this file is a map and a set of conventions, not a place to duplicate detail.

## What this is

A private, Android-first family mission app: strong reminders/alarms, missions with proof-based completion, parent escalation, bonus coins, and an in-app OpenClaw chat assistant. The backend is the source of truth; OpenClaw is advisory and can only mutate state through confirmed, validated action drafts.

Product spec: [docs/spec.md](docs/spec.md). Architecture: [docs/architecture.md](docs/architecture.md).

## Project map

| Path | Responsibility |
| --- | --- |
| `apps/api` | NestJS + Fastify API. Auth, pairing, children, missions, proof, alerts, coins, chat, OpenClaw orchestration. Prisma + Postgres. |
| `apps/worker` | BullMQ worker. Expands recurring occurrences, sends FCM reminders, handles deadlines/missed missions. |
| `apps/openclaw-adapter` | Fastify service isolating OpenClaw from app data. Proxies to OpenClaw or uses a deterministic fallback. |
| `apps/telegram-codex` | **Developer tool only.** Runs `codex exec` from Telegram. Not a family feature. See `apps/telegram-codex/README.md`. |
| `apps/android` | Native Android (Kotlin/Jetpack Compose) app. Child + parent modes. |
| `packages/shared` | Shared TypeScript contracts, enums, and schedule/timezone utilities. |
| `infra/docker` | Docker Compose + Caddy for the VPS deployment. |

## Tech stack

- **Backend:** TypeScript, NestJS on Fastify, Prisma, PostgreSQL.
- **Jobs:** BullMQ on Redis.
- **OpenClaw adapter:** Fastify; structured request/response only.
- **Android:** Kotlin, Jetpack Compose, Ktor client, FCM, AlarmManager.
- **Infra:** Docker Compose, Caddy reverse proxy.

## Conventions

- **Paths are relative to the repo root** in all documentation (`apps/api`, `docs/testing.md`). Never hardcode a developer's home directory. The only place an absolute path appears is [docs/deployment.md](docs/deployment.md), which records the VPS path `/srv/fm/family-manager`.
- Canonical facts live once in `docs/`. Humans read [README.md](README.md), per-app READMEs, and [docs/guides/](docs/guides/), which link into `docs/` rather than restating it.
- The local working directory and the VPS path differ by design; the local directory is not renamed.

## Build / test commands

```bash
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @family-manager/api prisma:generate
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

Per-service dev scripts (from repo root): `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:openclaw-adapter`, `pnpm dev:telegram-codex`.

## Run locally

```bash
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start
```

- API: `http://localhost:4000/api`
- Postgres: host port `5433` (another local project uses `5432`).
- Smoke check: `curl -i http://localhost:4000/api/children` → `HTTP/1.1 401` with `Missing bearer token`.

Full testing reference: [docs/testing.md](docs/testing.md).

## Current status

- **API / worker / adapter:** real and working. API has Zod input validation on every endpoint (`ZodValidationPipe` + schemas in `packages/shared`), local-disk proof file storage (photo upload/download behind `ProofStorageService`), and an integration suite (auth, pairing, RBAC, proof, coin idempotency, chat drafts) plus unit tests; worker has scheduling, push, deadline (notify/mark-missed/snooze-rescheduling) tests and a Redis-gated smoke test. See [docs/testing.md](docs/testing.md#api-integration-tests).
- **Coins:** awarded idempotently (unique constraint on `CoinLedger.occurrenceId`).
- **OpenClaw:** local runs use the adapter's deterministic fallback (unit-tested); the real container runs on the VPS alongside the stack.
- **Config safety:** the API validates security-sensitive env at boot (`apps/api/src/config/env.ts`) — fails fast in production on an unset/default/short `JWT_SECRET` or default `family:family` `DATABASE_URL` creds; warns (not fatal) in development.
- **FCM:** optional locally; the worker skips push silently when `FCM_SERVICE_ACCOUNT_JSON` is unset.
- **Android:** child flow (pairing, real today screen, Done/Snooze/Talk, chat + action-draft confirm cards), parent mode (login/bootstrap, children list, alerts, real "Generate Code"), and resilience (401 → refresh-token retry, `POST_NOTIFICATIONS` runtime prompt, boot-time alarm rescheduling) are all wired to the API. JVM unit tests cover the refresh flow and the boot-alarm store (`./gradlew :app:testDebugUnitTest`). Remaining: driving a build on a real phone over LAN (manual) and a Room cache (roadmap). See [docs/plans/android-bring-up.md](docs/plans/android-bring-up.md).
- **Device Action Bridge** (OpenClaw ↔ other Android apps): server backbone done — shared capability contracts, command bus (`device_commands`/results/grants, `GET /devices/commands`, idempotent result post, parent capability toggle), adapter + API `read_device_context` draft, and a `scripts/virtual-device.mjs` no-phone harness, all integration-tested. On-device Android handlers (capability registry, command-pull client, `read_calendar` over `CalendarContract`, FCM-ping + app-open triggers) are implemented with JVM unit tests; end-to-end emulator verification is pending. See [docs/features/device-action-bridge.md](docs/features/device-action-bridge.md).

Per-feature implementation detail and gaps: [docs/features/](docs/features/).

## Where to find things

- Product spec — [docs/spec.md](docs/spec.md)
- Architecture & authority boundaries — [docs/architecture.md](docs/architecture.md)
- Deployment (VPS, Compose, OpenClaw wiring) — [docs/deployment.md](docs/deployment.md)
- Testing (backend, emulator, device, bridge sim) — [docs/testing.md](docs/testing.md)
- Features — [docs/features/](docs/features/)
- Plans & roadmap — [docs/plans/](docs/plans/)
- Human guides — [docs/guides/](docs/guides/)
