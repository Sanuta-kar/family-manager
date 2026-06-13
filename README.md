# Family Mission App

A private, Android-first family app: strong reminders/alarms, missions with proof-based completion, parent escalation, bonus coins, and an in-app OpenClaw chat assistant. The backend is the source of truth; the assistant can only change schedules through confirmed, validated drafts.

## Quick start (local backend)

```bash
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @family-manager/api prisma:generate
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start          # API at http://localhost:4000/api
```

Then open `apps/android` in Android Studio and run on an emulator. Full instructions: [docs/testing.md](docs/testing.md) and the step-by-step [docs/guides/testing-walkthrough.md](docs/guides/testing-walkthrough.md).

## Workspace

- `apps/api` — NestJS/Fastify API. See [apps/api/README.md](apps/api/README.md).
- `apps/worker` — BullMQ worker for scheduling, reminders, and escalation.
- `apps/openclaw-adapter` — internal service isolating OpenClaw from app data.
- `apps/android` — native Android app. See [apps/android/README.md](apps/android/README.md).
- `apps/telegram-codex` — **developer tool** (Telegram → Codex bridge). See [apps/telegram-codex/README.md](apps/telegram-codex/README.md).
- `packages/shared` — shared TypeScript contracts and enums.
- `infra/docker` — Docker Compose and reverse-proxy config.

## Documentation

- Agents start at [CLAUDE.md](CLAUDE.md) (`AGENTS.md` is a symlink to it).
- Product spec: [docs/spec.md](docs/spec.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Deployment (VPS): [docs/deployment.md](docs/deployment.md)
- Testing: [docs/testing.md](docs/testing.md)
- Features: [docs/features/](docs/features/) · Plans & roadmap: [docs/plans/](docs/plans/) · User guides: [docs/guides/](docs/guides/)

## Using the assistant

For families: [docs/guides/using-the-assistant.md](docs/guides/using-the-assistant.md).

## Developer tools

The Telegram-Codex bridge lets an allowlisted Telegram chat run `codex exec` against this repository. It is a maintenance tool, not a family feature — see [apps/telegram-codex/README.md](apps/telegram-codex/README.md).
