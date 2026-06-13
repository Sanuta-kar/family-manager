# Testing Walkthrough (Step by Step)

A plain, ordered walkthrough for running the app locally and trying the core flow. For the full command reference and edge cases, see [../testing.md](../testing.md).

## 1. Start the backend

From the repository root:

```bash
docker compose -p family-manager -f infra/docker/docker-compose.yml up -d postgres
pnpm --filter @family-manager/api exec prisma migrate deploy
pnpm --filter @family-manager/api start
```

Check it is up:

```bash
curl -i http://localhost:4000/api/children
```

You should see `401 Missing bearer token`. That means the API is running and protected — exactly right.

## 2. Open the Android app

1. Open `apps/android` in Android Studio.
2. Let Android Studio install any missing SDK/Gradle components (and generate the Gradle wrapper if prompted).
3. Start an Android **emulator**. The debug app automatically talks to the backend at `http://10.0.2.2:4000/api`.

## 3. Pair a child device

1. Using the API (see the manual flow in [../testing.md](../testing.md)), bootstrap a parent, create a child, and generate a pairing code.
2. In the app's child screen, enter the pairing code.
3. The device pairs and stores its login — no crash should occur even if push (Firebase) is not set up.

## 4. Try the alarm screen without push

You do not need Firebase configured to see the strong-reminder screen. Trigger it directly with an `adb` intent (see the push testing strategy in [../testing.md](../testing.md)). This lets you test the Done/Snooze/Talk UI independently of push delivery.

## 5. Report what you find

Note what worked and what did not — especially: did it build, did it launch, did pairing succeed, did the alarm screen appear? Record findings in the Phase 0 assessment section of [../plans/android-bring-up.md](../plans/android-bring-up.md).
