# SiteProbe

SiteProbe is a mobile-first website QA platform. The long-term product will submit website targets from an Expo application to a backend that runs isolated browser checks.

## Current status: Product Phase P2

- Phase A — Expo/Metro/Hermes foundation
- Phase B — Shared contracts and fake Fastify API
- Phase C — Expo connected to the fake API
- Phase D — PostgreSQL + Drizzle persistence
- Phase E — Scanner security boundary and SSRF policy
- Phase F — Controlled Playwright scanner engine
- Phase G — Private authenticated scanner worker and isolation gate
- Product Phase P1 — Persistent scan history and improved synthetic results
- Product Phase P2 — Server-backed scan-history search

Phase A established the Expo mobile foundation:

- Expo SDK 57
- React Native
- TypeScript
- Expo Router
- Metro
- Hermes
- pnpm workspace

The app contains a Home scan form, searchable persistent Scan History route, and validated Scan Result route.

Phase B added the platform-neutral Zod contracts and a local-only Fastify fake API. Phase C connects the Expo client to that API: Home creates a scan, the server-created ID drives navigation, and the Result screen retrieves and validates the scan independently. Product Phase P1 adds persisted history with bounded cursor pagination and keeps the result experience explicitly synthetic. Product Phase P2 adds server-backed, case-insensitive literal search across persisted requested and normalized URLs while preserving cursor pagination.

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
pnpm check
```

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
