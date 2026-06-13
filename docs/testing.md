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

Current state: typecheck/test/build pass. The worker has scheduling and push tests. The API has no test files yet and its test script exits with `--passWithNoTests`.

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

- **Alarm UI without push:** trigger `AlarmActivity` directly via an `adb` intent so you can test the strong-reminder UX without any push delivery.
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
