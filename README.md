# Family Mission App

Private Android-first family mission app with strong reminders, OpenClaw chat, proof-based completion, parent escalation, and bonus coins.

The product specification is tracked in [docs/spec.md](docs/spec.md).
The current implementation handoff is tracked in [docs/development-handoff.md](docs/development-handoff.md).

## Workspace

- `apps/api` - NestJS/Fastify API service.
- `apps/worker` - BullMQ worker for scheduling, escalation, and retries.
- `apps/openclaw-adapter` - internal service that isolates OpenClaw from app data mutations.
- `apps/android` - native Android Kotlin/Compose application.
- `packages/shared` - shared TypeScript contracts and enums.
- `infra/docker` - Docker Compose and reverse-proxy configuration.

## Local Backend

```bash
corepack enable
pnpm install
pnpm --filter @family-manager/api prisma:generate
docker compose -f infra/docker/docker-compose.yml up --build
```

## Android

Open `apps/android` in Android Studio. The app is configured as a private APK-first native Android project.
