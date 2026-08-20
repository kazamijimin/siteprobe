# SiteProbe mobile

This Expo SDK 57 application is the SiteProbe mobile client.

## Routes

- `/` — URL entry and fake scan creation
- `/scans` — persisted synthetic scan history
- `/scans/[id]` — validated fake scan result retrieval

The app uses React Native, TypeScript, Expo Router, Metro, and Hermes. It connects to the local Fastify fake API using the shared contracts package and native `fetch`.

Product Phase P1 adds bounded scan-history pagination and keeps all displayed
results labeled as synthetic while real browser integration remains deferred
pending verified scanner isolation.

## Development

From the repository root:

```powershell
pnpm install
pnpm mobile:start
```

Set `EXPO_PUBLIC_API_URL` in `.env` using one of these local targets:

- Android emulator: `http://10.0.2.2:3000`
- Physical Android over LAN: `http://<DEVELOPMENT-PC-LAN-IP>:3000`
- Physical Android with `adb reverse`: `http://127.0.0.1:3000`

The API defaults to `127.0.0.1`; use an explicit `HOST=0.0.0.0` API override only for local device access. Do not expose it publicly.

Use `pnpm mobile:android` when an Android emulator or device is available. Android development requires Android Studio, Android SDK 36, platform-tools, and an Android Virtual Device or physical device.
