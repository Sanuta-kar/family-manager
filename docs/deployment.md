# Deployment

The production backend runs on a Hostinger VPS via Docker Compose, alongside the OpenClaw container.

> This is the only document that uses an absolute machine path. The VPS repository lives at `/srv/fm/family-manager`. Everywhere else, paths are relative to the repo root.

## VPS layout

- Repository: `/srv/fm/family-manager`
- The OpenClaw container runs on the same host and Docker network as the Compose stack, so `openclaw-adapter` can reach it over the internal network.
- The Telegram-Codex bridge (developer tool) also runs from this path; its session file defaults to `/srv/fm/family-manager/.telegram-codex-sessions.json` (see `apps/telegram-codex/README.md`).

## Compose stack

Defined in `infra/docker/docker-compose.yml`:

| Service | Image / build | Port(s) | Notes |
| --- | --- | --- | --- |
| `reverse-proxy` | `caddy:2.8` | 80, 443 | Routes the public host to `api:4000`. See `infra/docker/Caddyfile`. |
| `api` | `apps/api` Dockerfile | 4000 | NestJS API. Env `OPENCLAW_ADAPTER_URL=http://openclaw-adapter:4010`. |
| `worker` | `apps/worker` Dockerfile | — | BullMQ jobs. Needs Postgres + Redis. |
| `openclaw-adapter` | `apps/openclaw-adapter` Dockerfile | 4010 | Calls `OPENCLAW_BASE_URL`; falls back to a deterministic parser if unset. |
| `openclaw` | `openclaw/openclaw:latest` | 8080 | **Placeholder**, behind the `openclaw` Compose profile. Replace with the real image/config or remove and attach the adapter to the existing OpenClaw network. |
| `postgres` | `postgres:16-alpine` | host `5433` | App data. |
| `redis` | `redis:7-alpine` | host `6379` | Job queue. |

Start the full stack:

```bash
docker compose -p family-manager -f infra/docker/docker-compose.yml up --build
```

## Connecting the real OpenClaw

Choose one:

1. Replace the placeholder `openclaw` service in `docker-compose.yml` with the real image/config and set `OPENCLAW_BASE_URL` accordingly, or
2. Remove the placeholder service and attach `openclaw-adapter` to the existing OpenClaw Docker network.

Then verify from inside the Docker network:

```bash
curl http://openclaw-adapter:4010/health
```

and exercise `POST /chat` through the API. When `OPENCLAW_BASE_URL` is empty the adapter runs in fallback mode (see [features/chat-and-drafts.md](features/chat-and-drafts.md)).

## Secrets and configuration

From `.env.example`. Replace all defaults before exposing the VPS:

- `JWT_SECRET` — long random secret (the example value is a placeholder).
- `FCM_SERVICE_ACCOUNT_JSON` — Firebase service account JSON for push (see [features/push-notifications.md](features/push-notifications.md)).
- `DATABASE_URL` — replace the default `family:family` Postgres credentials.
- `OPENCLAW_BASE_URL` / `OPENCLAW_ADAPTER_URL` — OpenClaw wiring.
- `PROOF_STORAGE_PATH` — mounted volume path for proof images.
- `PUBLIC_API_BASE_URL` and the host in `infra/docker/Caddyfile` — replace `family.example.com`.

## Hardening checklist (before public exposure)

- Replace `JWT_SECRET` and Postgres credentials.
- Configure the real FCM service account.
- Connect the real OpenClaw container.
- Add persistent-volume backup/restore for Postgres and proof storage.
- Add logging and monitoring for API and worker.
- Keep the API private until auth, TLS, and FCM config are validated.
