# Feature: OpenClaw Chat and Action Drafts

## Purpose

Each family member chats with their own OpenClaw personality inside the app. Chat history is stored on the backend (visible to parents for safety/audit). OpenClaw is advisory: it can propose schedule/reminder changes, but those become real only as `chat_action_drafts` that the user explicitly confirms and the backend validates against role/policy. OpenClaw never mutates application state directly.

## Data model

- `chat_threads`, `chat_messages`, `chat_action_drafts`, `agent_personality_presets`, `agent_audit_logs`

Chat action draft statuses: `drafted`, `confirmed`, `rejected`, `expired`, `invalid`.

## API

- `GET /chat/threads`, `POST /chat/threads` — list/create threads (role-aware).
- `GET /chat/threads/:id/messages`, `POST /chat/threads/:id/messages` — read/send messages; sending calls the OpenClaw service and stores any returned action draft.
- `POST /action-drafts/:id/confirm` — confirm a draft (creates the mission template after RBAC/policy validation).
- `POST /action-drafts/:id/reject` — reject a draft.

Source: `apps/api/src/modules/chat`, `apps/api/src/modules/openclaw`, `apps/openclaw-adapter/src`, `packages/shared`.

## OpenClaw contract

The backend sends the adapter: user id, role, child profile id (if relevant), selected personality preset, recent chat history, current mission/schedule context, the allowed-actions list, and strict policy limits.

The adapter returns a structured response only: `messageText`, optional `actionDraft`, optional `snoozeDecision` (`approve | deny | ask_parent`), `reason`, and `safetyFlags`. The adapter **sanitizes** any `actionDraft` whose type is not in `allowedActions`, flagging it as removed. The adapter holds no database write credentials.

## Current state

Real wiring end to end.

- The adapter proxies to `OPENCLAW_BASE_URL` when configured; otherwise it uses a deterministic fallback parser.
- Fallback matches phrases like `remind me to <thing> (every day|daily) at HH:MM` and drafts a `CreateMissionTemplate` action (tap-done proof, daily recurrence, bounded snooze).
- Confirmed drafts flow through the same mission-template creation and worker scheduling as any other mission.

## Gaps

- The fallback is regex-only; the real OpenClaw API contract still needs schema validation of responses.
- Custom parent-written personalities are deferred (presets only in V1).
- The OpenClaw → other-Android-apps capability is a separate, spec-only feature — see [device-action-bridge.md](device-action-bridge.md).
