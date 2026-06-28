# API Hardening — Validation + Integration Tests

_Design spec. Created 2026-06-28._

## Problem

The API (`apps/api`) has no input validation. Every controller binds inline-typed
`@Body()`/`@Param()`/`@Query()` objects that are not checked at runtime, so malformed
or missing fields flow straight through the services into Prisma and surface as raw
`500`s (e.g. the documented missing-`platform` claim bug). The API also has effectively
no automated test coverage — only `devices.service.spec.ts` exists, and the test script
runs with `--passWithNoTests`.

This is the roadmap's **API hardening** item: DTO validation (Zod) plus integration tests
for auth, pairing, protected-mission RBAC, proof rejection, coin idempotency, and chat
draft confirmation.

## Goals

- Every API endpoint validates its input and returns a clean `400` (not a `500`) on bad
  input, with structured error details.
- Input contracts live once as Zod schemas in `@family-manager/shared`, reusable by other
  TS services (worker, adapter) later.
- Integration tests cover the highest-risk flows end-to-end against a real Nest + Fastify
  app and a real Postgres test database.

## Non-goals

- No rate limiting, auth/crypto changes, or new endpoints.
- No changes to business rules / domain error behavior (proof rejection, RBAC `403`s stay
  as they are) — this pass fixes **input** validation only.
- No refactor of service logic beyond what validation requires.

## Approach

### Zod schemas as single source of truth

Add `zod` as a dependency of `packages/shared`. For each endpoint input, define a schema
in shared and derive the type from it:

```ts
export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
```

These replace the inline object types in the controllers. Existing plain contract types
that already describe inputs (notably `MissionTemplatePayload`) get a corresponding schema;
where a schema and a hand-written type would duplicate, the type is switched to
`z.infer<...>` so there is one source of truth.

### `ZodValidationPipe` in the API

A single reusable NestJS pipe in `apps/api/src/common/`:

```ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: "Validation failed",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
```

Applied per parameter: `@Body(new ZodValidationPipe(LoginInputSchema)) body: LoginInput`.
Params and queries that need coercion/shape (`expiresInMinutes`, `requestedMinutes`,
`date`) use coercing schemas (`z.coerce.number().int().positive()`, etc.) so query
strings are converted and validated.

### Error-handling contract

Validation failures return `400`:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [{ "path": "email", "message": "Invalid email" }]
}
```

## Validation coverage (all endpoints)

| Module   | Endpoint(s)                              | Validation |
| -------- | ---------------------------------------- | ---------- |
| auth     | `parent/bootstrap`                       | email format, non-empty `name`/`familyName`, `password` min length |
| auth     | `login`                                  | email, non-empty password |
| auth     | `refresh`                                | non-empty `refreshToken` |
| devices  | `pairing-codes`                          | string `childProfileId`, positive int `expiresInMinutes?` |
| devices  | `claim`                                  | non-empty `code`/`deviceName`, `platform` enum, optional `fcmToken` |
| devices  | `fcm-token`                              | non-empty `fcmToken` |
| children | `create`                                 | non-empty `name`, optional `timezone` |
| missions | `createTemplate`                         | full `MissionTemplatePayload` schema (proof/snooze/reward policies) |
| missions | `updateTemplate`                         | partial `MissionTemplatePayload` schema |
| missions | `snooze`                                 | positive int `requestedMinutes`, optional `source` |
| missions | `proof`                                  | `type`, `payload`, optional `confidence` |
| missions | `parentReview`                           | `action` enum (`approve`/`reject`), optional `note` |
| missions | `today`                                  | optional `date` query (ISO date) |
| chat     | `createThread`                           | optional `title`/`childProfileId` |
| chat     | `sendMessage`                            | non-empty `text` |
| alerts   | `update`                                 | `status` enum (`open`/`resolved`/`dismissed`) |
| coins    | `getBalance`                             | param shape |

`platform` enum and `alert status` enum reuse / align with the enums already in
`@family-manager/shared`.

## Test strategy — integration

### Database

- A dedicated **`family_manager_test`** database on the existing local Postgres
  (`localhost:5433`, creds `family:family`).
- A vitest global setup creates the database if absent and runs `prisma migrate deploy`
  against the test `DATABASE_URL`.
- Each test (or `beforeEach`) truncates all tables for isolation.

### Harness

- Boot the real app via `Test.createTestingModule({ imports: [AppModule] })` with the
  Fastify adapter, then use Fastify's `app.inject()` for HTTP-level assertions (no
  `supertest` dependency).

### Covered flows

- **Auth:** bootstrap → login → refresh happy path.
- **Validation 400s:** malformed bodies on representative endpoints return `400` with
  `errors` (the new behavior; the core regression guard).
- **Pairing:** create pairing-code → claim → tokens returned with `childProfileId`.
- **Protected-mission RBAC:** a child token cannot mutate a `protected` template (`403`).
- **Proof rejection:** submitting a disallowed proof type returns `400`.
- **Coin idempotency:** completing the same occurrence twice yields exactly one
  `CoinLedger` row (the `occurrenceId` unique constraint).
- **Chat draft confirm:** a drafted action confirms and applies.

### CI / environment safety

Integration tests are gated on a reachable test database: if `DATABASE_URL` (test) is not
reachable, the suite **skips with a clear message** rather than failing, so `pnpm -r test`
stays green in environments without Postgres. The gating is explicit (a probe in global
setup), not silent.

## Rollout / sequencing (for the plan)

1. `zod` in shared + input schemas (no API change yet — typecheck only).
2. `ZodValidationPipe` + wire all controllers to schemas; manual smoke that a bad body now
   returns `400`.
3. Integration test harness (test DB setup, truncation, app boot helper).
4. Integration tests per covered flow.
5. Docs: update `docs/testing.md` and `docs/plans/roadmap.md` to reflect the new coverage;
   correct the stale "no test files yet" / "Now: Phase 1" notes.

## Open questions

None blocking. Testcontainers was considered for the test DB but rejected in favor of the
existing local Postgres + a dedicated test database, to match how the project already runs
Postgres and avoid a Docker-in-test dependency.
