# Telegram-Codex Bridge (Developer Tool)

> **This is a developer/maintenance tool, not a family feature.** It lets an allowlisted Telegram chat run `codex exec` against this repository. Anyone in `TELEGRAM_ALLOWED_CHAT_IDS` can ask Codex to inspect or edit the repo, so keep the allowlist tight.

## Setup

1. Create a Telegram bot with BotFather and put the token in `.env` as `TELEGRAM_BOT_TOKEN`.
2. Send any message to the bot, then open `https://api.telegram.org/bot<token>/getUpdates` and copy your numeric chat id into `TELEGRAM_ALLOWED_CHAT_IDS`.
3. Start the bridge:

```bash
pnpm --filter @family-manager/telegram-codex start:dev
```

## Commands

- `/help` — show bridge commands.
- `/status` — show the active Codex run.
- `/cancel` — stop the active Codex run.
- `/new` — forget the current Codex session for this chat; the next message starts fresh.

## How it works

By default the bridge runs:

```bash
codex exec --json --cd "$CODEX_WORKDIR" --sandbox workspace-write --ask-for-approval never "<telegram prompt>"
```

After the first message in a chat, the bridge stores that Codex session id in `.telegram-codex-sessions.json` and resumes it for later messages from the same chat (the session file is git-ignored). When a run finishes, the bridge sends the final answer plus a status block (duration, session id, exit state, current Git worktree summary).

## Configuration

See `.env.example` for the full set: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, `TELEGRAM_CODEX_MAX_PROMPT_CHARS`, `TELEGRAM_CODEX_RUN_TIMEOUT_MS`, `TELEGRAM_CODEX_SESSION_FILE`, `CODEX_BIN`, `CODEX_WORKDIR`, `CODEX_SANDBOX`, `CODEX_APPROVAL_POLICY`, `CODEX_EXTRA_ARGS`. On the VPS, `CODEX_WORKDIR` and the session file default to `/srv/fm/family-manager`.
