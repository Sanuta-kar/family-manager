# Family Mission App V1 Specification

## Summary

Build a private Android-first family app where reminders, alarms, missions, bonus coins, and in-app OpenClaw chat are the core experience. The app replaces Telegram as the family's OpenClaw channel: each parent/child chats with their own approved OpenClaw personality, chat history is stored on the backend, and schedules can be created or changed through chat after an explicit confirmation card.

## Architecture Decisions

- Mobile: native Android, Kotlin, Jetpack Compose, Room local cache, CameraX, FCM, Google Play Services location/geofencing, `AlarmManager` for strong reminders.
- Backend: TypeScript NestJS + Fastify, PostgreSQL + Prisma, Redis + BullMQ, Docker Compose on Hostinger VPS.
- OpenClaw: existing Docker service behind an internal `openclaw-adapter`; OpenClaw never writes directly to the database.
- Protocols: Android to backend via HTTPS REST JSON; backend to devices via FCM; backend to OpenClaw adapter via private Docker HTTP JSON.
- Auth: parent login plus child device pairing by one-time QR/code; child devices receive scoped JWT/refresh tokens.
- Storage: PostgreSQL for app data and chat history; local mounted volume for proof images in V1.
- Distribution: private APK.

## Core V1 Behavior

- Backend is source of truth for schedules, reminders, missions, proof status, coins, and chat history.
- Parent can create protected missions for children. Children cannot edit/delete protected missions.
- Children can create their own reminders and can edit/delete only reminders they created.
- Every user has an OpenClaw personality selected from parent-approved presets; free custom prompts are deferred.
- Full chat history is stored on the backend and visible to the parent for safety/audit.
- OpenClaw can draft schedule/reminder changes from chat, but changes become real only after the user taps Confirm.
- Backend validates all chat-created schedule actions against role permissions before saving.
- OpenClaw can approve snooze/exception requests only inside explicit backend policy limits.

## Main Components

- Android parent mode: children, schedule editor, mission templates, alerts, proof review, coin balances, OpenClaw chat.
- Android child mode: today screen, strong reminder/alarm screen, snooze, Done/proof capture, coin progress, OpenClaw chat.
- API service: auth, pairing, children, devices, schedules, missions, proof, alerts, coins, chat, OpenClaw orchestration.
- Worker service: expands recurring templates, sends reminders, starts escalation timers, handles missed missions, awards coins.
- OpenClaw adapter: converts backend context into OpenClaw requests and returns structured responses only.

## Data Model

Core tables:

- `families`, `users`, `child_profiles`, `devices`
- `mission_templates`, `mission_occurrences`, `snooze_events`
- `proof_submissions`, `alerts`, `coin_ledger`
- `chat_threads`, `chat_messages`, `chat_action_drafts`, `agent_personality_presets`, `agent_audit_logs`

Mission statuses:

- `scheduled`, `notified`, `snoozed`, `proof_pending`, `parent_review`, `completed`, `failed`, `cancelled`

Chat action draft statuses:

- `drafted`, `confirmed`, `rejected`, `expired`, `invalid`

## Selected Flows

### Pair Child Device

1. Parent creates child profile.
2. Parent generates one-time QR/code.
3. Child device claims code.
4. Backend binds device to child and issues scoped tokens.
5. Child app syncs assigned schedule and upcoming missions.

### Parent Creates Mission

1. Parent defines child, time, recurrence, proof policy, snooze policy, reward coins, protected flag.
2. Backend saves template.
3. Worker expands upcoming occurrences.
4. Child device syncs and schedules local Android alarms.

### Reminder / Alarm

1. Worker reaches reminder time and marks occurrence `notified`.
2. Backend asks OpenClaw for child-friendly message text.
3. Backend sends FCM to child device.
4. Android opens strong reminder/alarm UI.
5. Child chooses Done, Snooze, or Talk.

### Snooze

1. Child requests snooze in UI or chat.
2. Backend checks snooze count, allowed durations, hard deadline, and schedule conflicts.
3. If OpenClaw is allowed, backend asks for a bounded recommendation.
4. Backend approves/denies/escalates.
5. Android reschedules local alarm if approved.

### Proof Completion

1. Child taps Done and submits required proof.
2. Backend evaluates proof rules.
3. If proof passes, mission becomes `completed`.
4. Backend writes immutable coin ledger entry.
5. If proof is uncertain, mission becomes `parent_review`.

### Chat With OpenClaw

1. User sends message in app.
2. Backend stores message and sends scoped context to OpenClaw adapter.
3. OpenClaw returns response text plus optional structured action draft.
4. Backend stores response and validates any draft.
5. App displays chat response and, if needed, a Confirm card.
6. Confirmed schedule changes are saved by backend only after RBAC/policy validation.

### Schedule By Chat

1. Child says: "Remind me to practice piano every day at 18:00."
2. OpenClaw returns a structured draft.
3. Backend verifies child can create only own unprotected reminder.
4. App shows Confirm card.
5. Child confirms.
6. Backend creates mission template and worker schedules occurrences.

### Parent Escalation

1. Mission passes deadline or snooze limit.
2. Backend creates alert and sends parent FCM.
3. Parent reviews alert, proof, and chat context if relevant.
4. Parent marks complete, failed, requests proof, or changes mission.

## API Surface

Representative endpoints:

- `POST /auth/parent/bootstrap`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /devices/pairing-codes`
- `POST /devices/claim`
- `POST /devices/fcm-token`
- `POST /children`
- `GET /children`
- `POST /mission-templates`
- `GET /children/:childId/missions/today`
- `POST /mission-occurrences/:id/snooze`
- `POST /mission-occurrences/:id/done`
- `POST /mission-occurrences/:id/proofs`
- `POST /mission-occurrences/:id/parent-review`
- `GET /alerts`
- `PATCH /alerts/:id`
- `GET /children/:childId/coins`
- `GET /chat/threads`
- `POST /chat/threads`
- `GET /chat/threads/:id/messages`
- `POST /chat/threads/:id/messages`
- `POST /chat/action-drafts/:id/confirm`
- `POST /chat/action-drafts/:id/reject`

## OpenClaw Contract

Backend sends:

- user id, role, child profile id if relevant
- selected personality preset id
- recent chat history summary
- current mission/schedule context
- allowed actions list
- strict policy limits

OpenClaw returns:

- `message_text`
- `action_draft` optional
- `snooze_decision` optional: `approve | deny | ask_parent`
- `reason`
- `safety_flags`

Backend rejects any response that requests an action outside allowed permissions.

## First Implementation Steps

- Run `git init`.
- Create `docs/spec.md` with this specification.
- Add `.gitignore`.
- Commit: `docs: add initial family mission app spec`.
- Then scaffold monorepo: `apps/api`, `apps/worker`, `apps/android`, `packages/shared`, `infra/docker`, `docs`.

## Test And Acceptance Criteria

- Parent can create child profile and pair child Android device.
- Child can chat with own OpenClaw personality inside the app.
- Parent can chat with parent OpenClaw personality inside the app.
- Chat history is saved on backend and visible to parent.
- OpenClaw can draft a reminder from chat; it is not saved until Confirm is tapped.
- Child chat-created reminders are unprotected and child-owned.
- Child cannot use chat to edit/delete parent-protected missions.
- Dog walk mission completes with Done + geofence proof.
- Toothbrush mission accepts photo proof and can enter parent review.
- Missed mission after snoozes sends parent push alert.
- Coins increase only after completed/approved missions.
- OpenClaw cannot bypass backend snooze, schedule, or permission rules.

## TODO / Later Phases

- Phone/app blocking and usage limits.
- Windows, TV, and Meta Oculus clients.
- Google Calendar sync.
- Telegram/WhatsApp escalation.
- Homework checking and learning personalities.
- Better photo proof recognition.
- Custom parent-written OpenClaw personalities.
- Web admin dashboard.
- Private Play Store/internal distribution.

## References

- Android alarms: [developer.android.com/develop/background-work/services/alarms/schedule](https://developer.android.com/develop/background-work/services/alarms/schedule)
- Android background location: [developer.android.com/develop/sensors-and-location/location/background](https://developer.android.com/develop/sensors-and-location/location/background)
- Android geofencing: [developer.android.com/training/location/geofencing](https://developer.android.com/training/location/geofencing)
- OpenClaw agents: [openclawdoc.com/docs/agents/overview](https://openclawdoc.com/docs/agents/overview)
- OpenClaw security: [openclawdoc.com/docs/security/overview](https://openclawdoc.com/docs/security/overview)

