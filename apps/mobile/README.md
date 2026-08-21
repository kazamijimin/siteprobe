# SiteProbe mobile

This Expo SDK 57 application is the SiteProbe mobile client.

## Routes

- /qa-evaluations/[id] - development-gated controlled QA evaluation detail

- `/` — URL entry and fake scan creation
- `/scans` — persisted synthetic scan history
- `/scans/[id]` — validated fake scan result retrieval

The app uses React Native, TypeScript, Expo Router, Metro, and Hermes. It connects to the local Fastify fake API using the shared contracts package and native `fetch`.

Product Phase P1 adds bounded scan-history pagination. Product Phase P2 adds a
400 ms debounced, server-backed search across persisted URL history and keeps all
displayed results labeled as synthetic while real browser integration remains
deferred pending verified scanner isolation.

Product Phase P5 displays already-stored controlled evaluation snapshots. Viewing
an evaluation does not initiate scanning. The API read adapter is disabled by
default and is intended only for controlled development with
QA_EVALUATION_PUBLIC_READ_ENABLED=true configured in the API environment. The
the internal QA evaluation token remains server-side only and must never be placed
in this app or an EXPO_PUBLIC_* variable.

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

To inspect a known controlled evaluation during local development:

1. Produce a controlled QaEvaluation and store it through the authenticated internal API route.
2. Copy the returned evaluation ID.
3. Set QA_EVALUATION_PUBLIC_READ_ENABLED=true in services/api/.env only.
4. Open http://localhost:8082/qa-evaluations/<evaluation-id> in Expo web.

The detail screen is read-only, keeps the six findings in evaluator order, shows
structured evidence as plain text, and does not provide a scan or rescan action.
