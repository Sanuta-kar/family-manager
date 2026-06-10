# Family Mission App

Private Android-first family mission app with strong reminders, OpenClaw chat, proof-based completion, parent escalation, and bonus coins.

The product specification is tracked in [docs/spec.md](docs/spec.md).
The current implementation handoff is tracked in [docs/development-handoff.md](docs/development-handoff.md).

## Workspace

- `apps/api` - NestJS/Fastify API service.
- `apps/worker` - BullMQ worker for scheduling, escalation, and retries.
- `apps/openclaw-adapter` - internal service that isolates OpenClaw from app data mutations.
- `apps/telegram-codex` - optional Telegram long-polling bridge for running Codex on this host.
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

## Telegram Codex Bridge

This host already has the Codex CLI available, so the bridge runs `codex exec`
from Telegram messages. Keep it allowlisted: anyone in `TELEGRAM_ALLOWED_CHAT_IDS`
can ask Codex to inspect or edit this repository.

1. Create a Telegram bot with BotFather and put the token in `.env` as
   `TELEGRAM_BOT_TOKEN`.
2. Send any message to the bot, then open
   `https://api.telegram.org/bot<token>/getUpdates` and copy your numeric chat
   id into `TELEGRAM_ALLOWED_CHAT_IDS`.
3. Start the bridge:

```bash
pnpm --filter @family-manager/telegram-codex start:dev
```

Useful commands in Telegram:

- `/help` - show bridge commands.
- `/status` - show the active Codex run.
- `/cancel` - stop the active Codex run.
- `/new` - forget the current Codex session for this Telegram chat; the next
  message starts a fresh session.

By default the bridge uses:

```bash
codex exec --json --cd "$CODEX_WORKDIR" --sandbox workspace-write --ask-for-approval never "<telegram prompt>"
```

After the first message in a Telegram chat, the bridge stores that Codex session
id in `.telegram-codex-sessions.json` and resumes it for later messages from the
same chat. The session file is ignored by Git.

## Android

Open `apps/android` in Android Studio. The app is configured as a private APK-first native Android project.
