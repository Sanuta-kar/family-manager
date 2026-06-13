# Android App

Native Android (Kotlin / Jetpack Compose). Child and parent modes, FCM push, full-screen alarm UI, and the in-app assistant.

## Build and run

1. Open `apps/android` in Android Studio. Let it install missing SDK/Gradle components.
2. If there is no Gradle wrapper yet, generate one (`gradle wrapper --gradle-version 8.7`) or let Android Studio create it on first sync.
3. Start the backend first (see [../../docs/testing.md](../../docs/testing.md)).
4. Run on an **emulator** — debug builds target `http://10.0.2.2:4000/api` automatically.

## Real device

On a physical phone on the same Wi-Fi, point the debug build at the host's LAN IP:

```bash
./gradlew :app:assembleDebug \
  -PFAMILY_MANAGER_DEBUG_API_BASE_URL=http://<lan-ip>:4000/api
```

## Push and alarms

You can test the strong-reminder/alarm UI without configuring Firebase by launching `AlarmActivity` via an `adb` intent. Real end-to-end FCM needs a Firebase project. See the push testing strategy in [../../docs/testing.md](../../docs/testing.md).

## Status and plan

The current app has a real child-pairing flow; mission cards and several buttons are still stubbed. The phased bring-up and the Phase 0 baseline assessment are in [../../docs/plans/android-bring-up.md](../../docs/plans/android-bring-up.md).
