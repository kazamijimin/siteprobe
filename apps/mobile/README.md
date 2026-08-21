# SiteProbe mobile

This Expo SDK 57 application is the SiteProbe mobile client.

## Routes

- /qa-evaluations - development-gated controlled QA evaluation index
- /qa-evaluations/[id] - development-gated controlled QA evaluation detail
- /accessibility-evaluations/[id] - development-gated controlled accessibility evaluation detail
- /accessibility-evaluations - development-gated controlled accessibility evaluation index

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
internal QA evaluation token remains server-side only and must never be placed
in this app or an EXPO_PUBLIC_* variable.

Product Phase P9 adds the read-only Controlled Accessibility Evaluation detail
screen. Enable `ACCESSIBILITY_EVALUATION_PUBLIC_READ_ENABLED=true` in the API
environment only, then open `/accessibility-evaluations/<evaluation-id>` using an
ID produced by the controlled P8 workflow. The screen displays normalized
violations, needs-review checks, impact/node summaries, truncation notices,
engine metadata, targets, and timestamps as plain React Native text. It never
runs axe, starts a scanner, requests the target URL, or opens help URLs.

Product Phase P10 adds the read-only Controlled Accessibility Evaluations index.
It loads persisted P8 summaries with explicit `Load More` keyset pagination,
keeps navigation failures visibly distinct from completed checks, and links to
the existing detail screen. The index never runs axe, starts a scanner, creates
an evaluation, requests a target URL, or writes to PostgreSQL. It is separate
from synthetic scan history and remains development-gated by the API flag.

Automated accessibility checks are not equivalent to full WCAG conformance
testing. Accessibility violations indicate automated findings; they do not
establish that a page is WCAG compliant, certified, or fully accessible. The
public adapter is disabled by default and intended only for controlled
development. Phase H remains deferred pending verified isolation.

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

To browse persisted controlled evaluations during local development:

1. Set `QA_EVALUATION_PUBLIC_READ_ENABLED=true` in `services/api/.env` only.
2. Open `http://localhost:8082/qa-evaluations` in Expo web, or choose `View Controlled QA Evaluations` from Home.
3. Select an evaluation card to open the existing detail screen.

The index is read-only and lists summaries only. Controlled fixture generation
and authenticated ingestion remain part of a later phase; known evaluations
must still be created through the existing internal workflow.

To browse controlled accessibility evaluations during local development:

1. Set `ACCESSIBILITY_EVALUATION_PUBLIC_READ_ENABLED=true` in `services/api/.env` only.
2. Open `http://localhost:8082/accessibility-evaluations` in Expo web, or choose `View Controlled Accessibility Evaluations` from Home.
3. Use `Load More` to request the next persisted page, then select a card to open the P9 detail screen.

The screen shows controlled-fixture provenance and the WCAG testing disclaimer.
It never exposes selectors, raw axe data, help URLs, score, grade, or a
compliance percentage. Automated accessibility checks are not equivalent to
full WCAG conformance testing. Phase H remains deferred pending verified
isolation.

Product Phase P11 adds read-only navigation between paired controlled detail
screens. When both persisted records exist and both API read gates allow the
relationship, QA detail shows `View Accessibility Evaluation` and accessibility
detail shows `View Core QA Evaluation`. Missing or gate-disabled relationships
hide the action; buttons navigate only to SiteProbe routes and never open target
or fixture URLs. `scannerRunId` is never sent to or displayed by mobile.
