# SiteProbe

SiteProbe is a mobile-first website QA platform. The long-term product will submit website targets from an Expo application to a backend that runs isolated browser checks.

## Current status: Product Phase P7

- Product Phase P7 — Controlled fixture generation and authenticated ingestion

- Product Phase P6 — Controlled QA evaluation index

- Product Phase P5 â€” Controlled QA evaluation detail experience

- Phase A — Expo/Metro/Hermes foundation
- Phase B — Shared contracts and fake Fastify API
- Phase C — Expo connected to the fake API
- Phase D — PostgreSQL + Drizzle persistence
- Phase E — Scanner security boundary and SSRF policy
- Phase F — Controlled Playwright scanner engine
- Phase G — Private authenticated scanner worker and isolation gate
- Product Phase P1 — Persistent scan history and improved synthetic results
- Product Phase P2 — Server-backed scan-history search
- Product Phase P3 — Controlled QA evaluator
- Product Phase P4 — QA evaluation persistence and authenticated internal retrieval

Phase A established the Expo mobile foundation:

- Expo SDK 57
- React Native
- TypeScript
- Expo Router
- Metro
- Hermes
- pnpm workspace

The app contains a Home scan form, searchable persistent Scan History route, and validated Scan Result route.

Phase B added the platform-neutral Zod contracts and a local-only Fastify fake API. Phase C connects the Expo client to that API: Home creates a scan, the server-created ID drives navigation, and the Result screen retrieves and validates the scan independently. Product Phase P1 adds persisted history with bounded cursor pagination and keeps the result experience explicitly synthetic. Product Phase P2 adds server-backed, case-insensitive literal search across persisted requested and normalized URLs while preserving cursor pagination. Product Phase P3 adds a deterministic in-process QA evaluator for `ScannerResult` objects produced by controlled fixture scans. Product Phase P4 adds shared versioned QA contracts and an independent PostgreSQL JSONB snapshot repository behind authenticated internal POST/GET routes. Neither phase exposes evaluations through public scans, mobile, or the scanner worker.

Product Phase P5 adds a development-gated, read-only /api/qa-evaluations/:id adapter and the Expo /qa-evaluations/[id] detail screen. P5 displays already-stored controlled evaluation snapshots; viewing a result does not initiate scanning. The adapter is disabled by default, exposes a reduced projection without scannerRunId or scores, and the internal evaluation token remains server-side only.

Product Phase P6 adds a development-gated, read-only `/api/qa-evaluations` index with opaque cursor pagination and the Expo `/qa-evaluations` discovery screen. It lists only already-persisted controlled evaluation summaries, remains separate from synthetic scan history, and never starts a scan, evaluator, browser, DNS lookup, or target request. The existing `QA_EVALUATION_PUBLIC_READ_ENABLED` flag remains default-off; fixture generation and ingestion remain deferred to P7.

Product Phase P7 adds a developer-only `pnpm controlled:fixture <id>` workflow for seven repository-owned fixture IDs. The workflow runs the existing controlled Playwright scanner in-process, evaluates the resulting `ScannerResult` once, and persists it through the authenticated `POST /internal/qa-evaluations` route. It accepts no arbitrary URL, host, path, or target, gives the scanner no database credentials, does not change public synthetic scans, and does not require the P5/P6 public-read flag for ingestion. Phase H remains deferred pending verified isolation.

Phase D replaces the API's in-memory repository with PostgreSQL persistence through Drizzle ORM and versioned SQL migrations. Phase E adds the scanner safety boundary: URL policy, DNS/IP classification, redirect validation, passive request policy, and resource limits. Phase F adds a controlled Chromium engine that reuses those checks and returns internal observations. Phase G adds a loopback-only authenticated scanner worker, a fail-closed isolation gate, and an API-side client that is deliberately not used by the public route.

Scan results remain deterministic synthetic placeholders in the public API. The Phase F/G engine is available only behind the private worker boundary; the public API and mobile app do not launch Playwright.

## Workspace

```text
apps/mobile/   Expo application
packages/contracts/  Shared request, response, and error contracts
services/api/        Local Fastify fake API
services/api/src/db/ PostgreSQL/Drizzle database boundary
services/api/drizzle/ Versioned SQL migrations
services/scanner/ Private scanner worker, security boundary, and controlled Playwright engine
services/scanner/src/browser/ Playwright/Chromium orchestration and request interception
services/scanner/src/scan/ Internal observation result and scan runner
services/scanner/src/evaluation/ Internal deterministic QA evaluator
tools/controlled-evaluations/ Developer-only controlled fixture workflow
services/scanner/src/isolation/ Capability model and fail-closed execution gate
services/scanner/src/routes/ Private health, readiness, and scan endpoints
```

## Install and start

Requirements:

- Node.js 24 LTS
- pnpm 11
- PostgreSQL 17 for persisted API development
- Android Studio with Android SDK 36, an emulator, or a physical Android device

From the repository root:

```powershell
pnpm install
pnpm mobile:start
```

Run the local fake API with:

```powershell
pnpm api:dev
```

It binds to `127.0.0.1:3000` by default. Copy `services/api/.env.example` to `services/api/.env` and set a dedicated local PostgreSQL `DATABASE_URL`.

Apply committed migrations before starting the API:

```powershell
pnpm db:migrate
```

Generate/check migrations with `pnpm db:generate` and `pnpm db:check`. Database integration tests are opt-in through `SITEPROBE_TEST_DATABASE_URL` and must target a dedicated test database.

Start the mobile app in a second terminal with `pnpm mobile:start`. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` for the device target:

- Android emulator: `http://10.0.2.2:3000`
- Physical Android over local LAN: `http://<DEVELOPMENT-PC-LAN-IP>:3000`
- Physical Android with `adb reverse`: `http://127.0.0.1:3000`

The API remains loopback-only by default. Use `HOST=0.0.0.0` only as an explicit local development override for device access; do not expose or port-forward it publicly.

For a one-command backend start, configure both service environment files and run:

```powershell
if (-not (Test-Path services/api/.env)) { Copy-Item services/api/.env.example services/api/.env }
if (-not (Test-Path services/scanner/.env)) { Copy-Item services/scanner/.env.example services/scanner/.env }
# Set DATABASE_URL and SCANNER_INTERNAL_TOKEN in the copied files.
.\start.ps1
```

This starts the API and private scanner in the background. Logs and process state
are stored in the ignored `.siteprobe/` directory. Stop them with:

```powershell
.\stop.ps1
```

Add `-IncludeMobile` to start the Expo/Metro process for an emulator or device,
or use `-IncludeWeb` to serve the Expo frontend in a browser:

```powershell
.\start.ps1 -IncludeWeb
```

The web frontend is available at `http://localhost:8082`. Browser mode
automatically uses the local API at `http://127.0.0.1:3000`, so your Android
emulator setting in `apps/mobile/.env` can remain `http://10.0.2.2:3000`.
Choose only one of `-IncludeMobile` and `-IncludeWeb` per start command.

Useful validation commands:

```powershell
pnpm contracts:test
pnpm api:test
pnpm mobile:test
pnpm db:check
pnpm db:test
pnpm scanner:typecheck
pnpm scanner:test
pnpm scanner:install-browser
pnpm controlled:fixture:test
pnpm check
```

## Run a controlled fixture evaluation

P7 supports only the closed catalog of repository-owned fixture IDs:

```text
healthy
missing-title
status-404
redirect-ok
navigation-timeout
console-error
failed-resource
```

The workflow does not accept arbitrary URLs or destinations. It uses the
scanner's in-process `fixture.invalid` route fulfillment and the existing URL,
DNS, redirect, request, and resource policies before a page is fulfilled.

Start the API first, install Chromium, and configure the tool-local
`tools/controlled-evaluations/.env` from its example:

```env
SITEPROBE_API_URL=http://127.0.0.1:3000
QA_EVALUATION_INTERNAL_TOKEN=<server-side-token>
```

Then run:

```powershell
pnpm controlled:fixture --list
pnpm controlled:fixture healthy
```

The command prints the scanner run ID, persisted evaluation ID, summary counts,
and the relative P5 detail path. It uses the existing authenticated internal
ingestion API; it does not write PostgreSQL directly, does not require
`QA_EVALUATION_PUBLIC_READ_ENABLED=true`, and does not use the private scanner
worker token. To browse the result in Expo, enable the P5/P6 read flag on the
API separately and open the printed path.

## View a controlled QA evaluation

Product Phase P5 is a read-only inspection experience for evaluations that have
already been produced by the controlled scanner/evaluator and stored through the
authenticated internal route. It does not create evaluations or initiate a scan.

Enable the server-side adapter only for controlled local development:

~~~env
QA_EVALUATION_PUBLIC_READ_ENABLED=true
~~~

Keep this variable out of Expo and never put QA_EVALUATION_INTERNAL_TOKEN in
mobile configuration. After authenticated internal ingestion returns an
evaluation ID, open the Expo web detail route:

~~~text
http://localhost:8082/qa-evaluations/<evaluation-id>
~~~

The screen shows controlled provenance, requested/final URLs,
critical/warning/passed/not-applicable counts, six findings in evaluator order,
bounded evidence, and technical timestamps. URLs and browser evidence are plain
selectable text and are never opened by the app. The public /api/scans flow
remains synthetic, and Phase H remains deferred pending verified isolation.

## Run the controlled scanner

Phase F includes a real Playwright/Chromium engine, but it is intentionally not
connected to `POST /api/scans` or the Expo app. Use it only with the deterministic
fixture suite:

```powershell
# Install the workspace dependencies.
pnpm install

# Install Chromium once for the scanner package.
pnpm scanner:install-browser

# Run scanner type checking and controlled browser tests.
pnpm scanner:typecheck
pnpm scanner:test
```

The scanner tests use injected DNS answers and controlled Playwright routes. They
do not browse arbitrary public websites. The browser is launched only by the
scanner test runner, with a non-persistent context and the Phase E request
safety policy applied to every request.

Product Phase P3 evaluates those controlled `ScannerResult` observations with six
deterministic QA rules covering navigation, document title presence, runtime
errors, and failed requests. Product Phase P4 persists complete evaluator
snapshots only through authenticated internal QA routes. It does not calculate a
score, modify public scan behavior, or connect arbitrary URLs to a scanner.

The scanner package does not currently expose a public HTTP endpoint or a
standalone production scan command. Do not wire it to mobile/API requests until
network isolation and egress controls have been reviewed.

## Run the private scanner worker

Phase G adds a loopback-only internal worker. It requires a server-only bearer
token and defaults to controlled mode:

```powershell
Copy-Item services/scanner/.env.example services/scanner/.env
# Edit services/scanner/.env and replace SCANNER_INTERNAL_TOKEN.
pnpm scanner:dev
```

The worker listens on `127.0.0.1:3100` by default. Liveness does not require
authentication:

```powershell
Invoke-RestMethod http://127.0.0.1:3100/health
```

`/ready` reports whether unrestricted isolated execution is approved. In the
default `controlled` mode it intentionally reports `not-ready`; this is expected
and does not mean the process is unhealthy. Internal scan requests require:

```text
Authorization: Bearer <SCANNER_INTERNAL_TOKEN>
```

Controlled mode executes only exact hostnames listed in
`SCANNER_CONTROLLED_HOSTS`. Isolated mode requires a fresh, root-owned signed
deployment attestation plus runtime and network evidence; ordinary
`SCANNER_CAP_*` environment values cannot make it ready. Do not put the token
in Expo or any `EXPO_PUBLIC_*` variable. The public `POST /api/scans` route
remains synthetic and does not call the worker.

## Deployment isolation gate

The worker's application policy and authenticated boundary are defense-in-depth;
they are not network isolation. Before setting `SCANNER_EXECUTION_MODE=isolated`
for arbitrary URLs, deployment must provide and verify:

- public-internet-only egress through a controlled firewall/proxy;
- denial of loopback, host services, private LAN, metadata, PostgreSQL, and Docker sockets;
- non-root execution with Chromium sandboxing enabled;
- no privileged mode, host networking, cloud credentials, or sensitive mounts;
- read-only filesystems where feasible, minimal capabilities, seccomp, and disposable workers;
- CPU, memory, PID/process, request, and job limits.

A normal Docker bridge is not sufficient because it permits external access by
default. A Docker `--internal` network is also insufficient because it removes
the public egress the scanner needs. The required design is an isolated worker
behind a controlled egress layer. The current Windows development process is not
network-isolated, so public arbitrary-URL scanning remains unapproved.

To launch the Android target when an emulator or device is available:

```powershell
pnpm mobile:android
```

Phase D requires PostgreSQL and Drizzle for API persistence. Phase E uses DNS only when explicitly evaluating a destination through the scanner safety API; tests inject deterministic resolvers. Phase F requires the scanner-local Playwright Chromium install for controlled tests. Phase G adds the private worker boundary, but does not wire browser execution into the public API.

Product Phase P1 adds `GET /api/scans` and the mobile `/scans` history screen.
Product Phase P2 adds the optional `q` query parameter for server-backed history
search. History records are persisted synthetic results from the public API. Real
browser integration remains deferred pending verified scanner isolation.

Phase E/F provide application-level SSRF defenses and per-request browser interception. Phase G adds authentication and a fail-closed isolation gate, but these are still not a complete network boundary. SiteProbe is not approved for public arbitrary-URL scanning until deployment adds isolated execution and network-level egress controls: no host/database/LAN/metadata access, no Docker socket or sensitive mounts, non-root execution, Chromium sandboxing, resource limits, deadlines, and controls to address DNS rebinding.

Phase G.5 repository-side deployment definitions live under
`infra/scanner-vm/`. They describe the Linux VM systemd boundary, nftables
default-deny policy, controlled DNS, mandatory proxy, and canary verification
scripts. They are not applied to this Windows machine; isolated readiness stays
`503` until the real VM produces trusted evidence.
