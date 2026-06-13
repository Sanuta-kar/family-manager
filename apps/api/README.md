# API Service

NestJS (on Fastify) + Prisma + PostgreSQL. Auth, device pairing, children, missions, proof, alerts, coins, chat, and OpenClaw orchestration.

## Run locally

From the repository root:

```bash
pnpm --filter @family-manager/api prisma:generate
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start          # http://localhost:4000/api
```

Smoke check: `curl -i http://localhost:4000/api/children` → `401 Missing bearer token`.

Postgres is on host port `5433` locally (see [../../docs/testing.md](../../docs/testing.md)).

## More

- Endpoints and behavior per feature: [../../docs/features/](../../docs/features/)
- Full testing reference and manual flow: [../../docs/testing.md](../../docs/testing.md)
