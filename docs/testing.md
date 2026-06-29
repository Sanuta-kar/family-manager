# Testing

Canonical testing reference for the backend, worker, emulator, real device, and the Device Action Bridge simulation. For a human, step-by-step walkthrough, see [guides/testing-walkthrough.md](guides/testing-walkthrough.md).

## Local backend

From the repository root:

```bash
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @family-manager/api prisma:generate
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start
```

- API: `http://localhost:4000/api`
- Postgres: host port `5433` (another local project uses `5432`, so this stack must not bind there).

Smoke check (unauthenticated):

```bash
curl -i http://localhost:4000/api/children
```

Expected: `HTTP/1.1 401` with `Missing bearer token`.

Stop local Postgres:

```bash
docker compose -p family-manager -f infra/docker/docker-compose.yml down
```

## Verification commands

Run after backend or worker changes:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

Check migration status:

```bash
DATABASE_URL="postgresql://family:family@localhost:5433/family_manager?schema=public" \
  pnpm --filter @family-manager/api exec prisma migrate status
```

Current state: typecheck/test/build pass. The worker has scheduling, push, deadline (notify / mark-missed / snooze-rescheduling), and a Redis smoke test. The API has unit tests (the `ZodValidationPipe`, `DevicesService`, `ProofStorageService`, `DeviceCommandsService`) plus an integration suite (auth, pairing, RBAC, proof rejection, photo proof upload/download, coin idempotency, chat draft confirm, and the device action bridge loop) — see below. The OpenClaw adapter has unit tests for its deterministic fallback and response sanitization. The API also fails fast at boot on insecure production config (`config/env.ts`, unit-tested).

### API integration tests

The API integration suite (`apps/api/test/integration/`) boots the real Nest + Fastify app and drives it over HTTP via Fastify's `inject()`, against a dedicated Postgres test database. It never touches the dev database.

One-time setup (Postgres must be running):

```bash
# create the test database (run once)
echo "CREATE DATABASE family_manager_test;" | \
  pnpm --filter @family-manager/api exec prisma db execute \
  --url "postgresql://family:family@localhost:5433/family_manager?schema=public" --stdin

# apply migrations to it (re-run after adding migrations)
DATABASE_URL="postgresql://family:family@localhost:5433/family_manager_test?schema=public" \
  pnpm --filter @family-manager/api exec prisma migrate deploy
```

Then `pnpm --filter @family-manager/api test` runs unit + integration tests. The suite **skips cleanly with a message** when the test database is unreachable, so `pnpm -r test` stays green in environments without Postgres. Override the connection with `TEST_DATABASE_URL` if needed. Each test truncates all tables for isolation; tests run serially in a single worker.

One command does the whole thing — create the test DB if needed, migrate it, and run every workspace test:

```bash
pnpm test:all
```

(wraps `scripts/test-all.sh`; idempotent and safe to re-run. Postgres must be running.)

### Worker tests + Redis smoke test

The worker's deadline logic (`notify-occurrence`, `mark-missed`, and the snooze-deadline
rescheduling path) is unit-tested with fakes in `apps/worker/src/deadlines.test.ts` — no Redis
needed. A separate smoke test (`redis-smoke.test.ts`) boots a real BullMQ `Queue` + `Worker`
and verifies a job is processed end-to-end. Start Redis first:

```bash
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d redis
pnpm --filter @family-manager/worker test
```

Like the API suite, the smoke test **skips cleanly with a message** when Redis is unreachable
(override with `REDIS_URL`), so `pnpm -r test` stays green without Redis.

### Device action bridge (no phone)

The full server↔device command loop is covered in-process by the API integration suite
(`device action bridge` block). To exercise it manually against a running API without an
Android device, use the virtual-device harness — it pairs (or takes a child token), polls
`GET /devices/commands`, and posts synthetic results:

```bash
node scripts/virtual-device.mjs --code <PAIRING_CODE>   # or: --token <CHILD_JWT>
```

## Manual API test flow

Run before Android testing:

1. Bootstrap a parent.
2. Create a child profile.
3. Generate a pairing code.
4. Claim the pairing code as a child device.
5. Create a parent-protected mission for the child.
6. List the child's today missions.
7. Submit Done / proof.
8. Verify invalid proof payloads are rejected.
9. Verify coins are awarded only once.
10. Create a chat thread.
11. Send a reminder draft request, e.g. `Remind me to practice piano every day at 18:00`.
12. Confirm the draft.
13. Verify the created mission uses a valid recurrence and appears in scheduling.

## Android — emulator

- Debug builds default to `http://10.0.2.2:4000/api` (the emulator route to the Mac host). Cleartext HTTP is enabled for debug, disabled for release.
- Override with the Gradle property `FAMILY_MANAGER_DEBUG_API_BASE_URL`.
- See [plans/android-bring-up.md](plans/android-bring-up.md) for the phased bring-up and the Phase 0 baseline.

## Android — real device

On a physical phone on the same Wi-Fi, use the Mac LAN IP:

```bash
./gradlew :app:assembleDebug \
  -PFAMILY_MANAGER_DEBUG_API_BASE_URL=http://192.168.1.41:4000/api
```

(Replace `192.168.1.41` with the host's current LAN IP.)

## Push testing strategy

Real FCM requires a Firebase project: `google-services.json` on the Android app and `FCM_SERVICE_ACCOUNT_JSON` on the worker. To avoid blocking UI/alarm testing on that setup, the two are **decoupled**:

- **Alarm UI without push:** to test the strong-reminder UX without push delivery, trigger `AlarmActivity` through its normal alarm path. Note it is declared `android:exported="false"`, so a plain `adb shell am start -n …/.alarm.AlarmActivity` is rejected with a `SecurityException`; either drive it via `AlarmManager`/the receiver, or temporarily set `android:exported="true"` in a debug build to launch it directly.
- **End-to-end FCM:** treat real push delivery as its own checklist item, performed once a Firebase project exists.
- Confirm FCM token registration fails gracefully (no crash) when Firebase is not configured.

## Device Action Bridge simulation

The bridge (OpenClaw ↔ other Android apps) is spec-only today; see [features/device-action-bridge.md](features/device-action-bridge.md). Its testing uses three seams so most of it can be exercised with no phone:

- **OpenClaw seam:** extend the adapter's deterministic fallback to emit a `read_device_context` draft for a test phrase.
- **Device-channel seam:** a virtual-device CLI harness that pairs as a child device, polls the command inbox, and returns synthetic results — exercises the full server↔device loop without a phone.
- **On-device seam:** a mock capability handler returning canned data, then a real `read_calendar` handler against a seeded event in the emulator's Calendar, with a trivial companion stub app as the cross-app target.

## Known local blockers

- Docker Hub pulls have hung for uncached images on this machine (`redis:7-alpine`, `node:22-alpine`, `caddy:2.8`), which blocks full Compose. Postgres works because `postgres:16-alpine` is cached locally. Retry full Compose when pulls work.
- Postgres is on host `5433` because another local project uses `5432`.
