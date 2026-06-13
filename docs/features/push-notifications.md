# Feature: Scheduling and Push Notifications

## Purpose

The worker turns mission templates into dated occurrences, notifies child devices at the scheduled time via FCM, enforces deadlines, and escalates missed missions to parents.

## Worker jobs

Source: `apps/worker/src` (BullMQ queue `missions`, backed by Redis).

- `expand-occurrences` — runs at startup and every 5 minutes. Reads all mission templates, computes the next occurrences within a 7-day horizon (via `occurrenceDatesForSchedule()` in `packages/shared`, using the child profile timezone), inserts non-duplicate `mission_occurrences`, and enqueues `notify-occurrence` jobs with the appropriate delay.
- `notify-occurrence` — marks the occurrence `notified`, sets a 15-minute deadline, enqueues a `mark-missed` job for the deadline, and sends an FCM push to the child's devices.
- `mark-missed` — if the occurrence is still `notified` at the deadline, marks it `failed` and creates a parent-facing alert. Respects snooze postponements so a snoozed mission is not failed by the original deadline.

Tests: `apps/worker/src/scheduling.test.ts` (occurrence expansion, timezone, RRULE-style daily recurrence) and `apps/worker/src/push.test.ts` (FCM client, service-account parsing).

## FCM push

- The worker reads `FCM_SERVICE_ACCOUNT_JSON`, mints an OAuth JWT assertion, exchanges it for a token, and posts to the FCM v1 endpoint with a high-priority Android message (notification + data fields).
- If credentials are not configured, the worker **skips push silently** (graceful degradation) — useful for local development.
- On the device, `FamilyMessagingService` registers/refreshes the FCM token with the backend and, on a `mission_reminder` push, launches `AlarmActivity` (the full-screen strong-reminder UI).

## Current state

Real. Scheduling and the FCM client are implemented and unit-tested.

## Gaps

- End-to-end FCM delivery is untested without a real Firebase project (`google-services.json` on the app, `FCM_SERVICE_ACCOUNT_JSON` on the worker). The testing doc decouples alarm-UI testing from push delivery — see [../testing.md](../testing.md).
