# Worker: testable deadline logic + Redis smoke test

_Design spec. Created 2026-06-29._

## Problem

The worker's reminder/deadline logic — `notifyOccurrence`, `markMissed`, `enqueueMarkMissed`
— lives inline in `apps/worker/src/main.ts`. That file instantiates a Redis connection, a
BullMQ `Queue` and `Worker`, and calls `bootstrap()` at import time, so the logic cannot be
imported into a test without side effects. As a result the **snooze-deadline rescheduling**
behavior is untested: when a child snoozes, the API pushes `currentDeadlineAt` into the
future, and a `mark-missed` job that fires at the old deadline must *re-enqueue itself* for
the new deadline instead of failing the mission. This is exactly the kind of logic that
needs a regression test.

Separately, the worker has never been smoke-tested against a real Redis locally.

This is the roadmap's **Worker** item: get Redis running locally and smoke-test; add
snooze-deadline rescheduling tests.

## Goals

- The deadline logic is in a module that can be unit-tested with a fake Prisma and fake queue.
- The snooze-deadline rescheduling path has explicit tests, alongside the fail/no-op paths.
- A Redis-backed smoke test proves the worker can process a queued job end-to-end, and skips
  cleanly when Redis is unreachable (so `pnpm -r test` stays green without Redis).

## Non-goals

- No behavior change to the worker — this is a refactor + tests. (`main.ts` keeps doing
  exactly what it did; it just delegates to the extracted functions.)
- No change to the API snooze endpoint, scheduling, or push code.

## Approach

### Extract `deadlines.ts`

New `apps/worker/src/deadlines.ts` with pure-ish functions that take their dependencies as
parameters (mirroring `scheduling.ts`'s `expandOccurrences(prisma, queue, …)` style):

- `enqueueMarkMissed(queue, occurrenceId, deadlineAt)` — adds a delayed `mark-missed` job
  keyed by `mark-missed-<id>-<deadlineMs>`.
- `notifyOccurrence(deps, occurrenceId, now?)` — `deps = { prisma, queue, pushClient }`.
  Loads the occurrence; if not `scheduled`, no-op; else set `notified` + a 15-minute
  `currentDeadlineAt`, enqueue `mark-missed`, and send the push.
- `markMissed(deps, occurrenceId, now?)` — loads the occurrence; no-op for
  `completed/failed/cancelled/parent_review` or if missing; **if `currentDeadlineAt` is in
  the future, re-enqueue `mark-missed` for that later time and return** (the snooze path);
  otherwise fail the occurrence and create a "Mission missed" alert in one transaction.

`deps` is a small interface (`{ prisma: PrismaClient; queue: Pick<Queue,"add">; pushClient }`),
so tests pass `vi.fn()`-backed fakes. `now` is injectable for deterministic timing.

### Rewire `main.ts`

`main.ts` imports `notifyOccurrence`/`markMissed` from `deadlines.ts` and calls them from the
job switch with the real `{ prisma, queue, pushClient }`. The Redis/Worker/bootstrap wiring
stays in `main.ts`. Net behavior unchanged.

### Redis smoke test

`apps/worker/src/redis-smoke.test.ts`:

- Probe Redis (`ioredis` ping to `REDIS_URL` / `redis://localhost:6379`); if unreachable,
  `describe.skip` with a clear message.
- Boot a real `Queue` + `Worker` on a unique queue name (`smoke-<random>`), enqueue a job,
  and assert the worker processes it (resolve a promise from the processor, or
  `job.waitUntilFinished(queueEvents)`), then tear everything down (close worker, queue,
  connections) so the test process exits cleanly.

This exercises the real BullMQ⇄Redis loop without Postgres or FCM.

## Testing

- **Unit** (`deadlines.test.ts`, fake prisma + queue):
  - `markMissed` with `currentDeadlineAt` in the future → re-enqueues, does **not** fail.
  - `markMissed` with the deadline passed → fails the occurrence and creates an alert.
  - `markMissed` no-ops for closed statuses and for a missing occurrence.
  - `notifyOccurrence` on a `scheduled` occurrence → sets `notified` + deadline, enqueues
    `mark-missed`, sends one push; non-`scheduled` → no-op.
  - `enqueueMarkMissed` → correct `delay`/`jobId`.
- **Integration**: the Redis smoke test above.

## Rollout / sequencing (for the plan)

1. Extract `deadlines.ts` + unit tests (TDD), keeping `main.ts` behavior identical.
2. Rewire `main.ts` to delegate.
3. Add the Redis smoke test.
4. Docs: `testing.md` (Redis smoke + how to start Redis), `roadmap.md` (Worker → Done).

## Open questions

None blocking.
