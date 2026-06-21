# Feature: Auth and Device Pairing

## Purpose

Parents authenticate with email/password and bootstrap the first family. Child devices join through a one-time pairing code and receive scoped child JWTs that can access only their own child profile and missions.

## Data model

- `families`, `users`, `child_profiles`, `devices`, `device_pairing_codes`

A `child_profile` has an associated child `user`. A pairing code is bound to a `child_profile` and family, with an expiry and a `claimedAt` marker.

## API

- `POST /auth/parent/bootstrap` — create the first family, parent user, and a default OpenClaw personality preset.
- `POST /auth/login` — parent email/password login; returns an access + refresh token pair.
- `POST /auth/refresh` — exchange a refresh token for a new pair.
- `POST /devices/pairing-codes` — parent-only; returns `{ code, childProfileId, expiresAtMinutes }`.
- `POST /devices/claim` — child device submits `{ code, deviceName, platform, fcmToken? }`; creates the device, marks the code used, and returns a child token pair plus `childProfileId` and `childDisplayName`.
- `POST /devices/fcm-token` — paired child device registers/updates its FCM token.

Source: `apps/api/src/modules/devices/devices.service.ts`, `apps/api/src/modules/devices/devices.controller.ts`, and the `auth` module.

## Current state

Real and working.

- Pairing codes are SHA-256 hashed before storage; default expiry 15 minutes.
- Access token lifetime ~15 minutes; refresh token ~30 days.
- Claim validates the code is unclaimed and unexpired, links the device to the child profile, and issues a child token pair with `role=child`, `childProfileId`, and `deviceId` encoded in the JWT.
- Child RBAC: a child can access only their own child profile.

## Gaps

- No DTO validation library on request bodies yet.
- No automated API tests yet.
