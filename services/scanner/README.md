# SiteProbe scanner safety boundary

This package contains the application-level policy, controlled Playwright engine,
and private Fastify worker for accessing a user-supplied destination. The public
API does not call this worker. DNS lookups are only used by the explicit
security-policy API and are injectable in tests.

The policy validates HTTP(S) URLs, rejects credentials and local names, classifies
IPv4/IPv6 addresses (including IPv4-mapped IPv6), evaluates every DNS answer, and
provides reusable redirect and browser-request checks.

The `scannerResourcePolicy` object separates policy that is defined for Phase F
from controls that are actually enforced in this package. Browser execution,
request interception, navigation/job/request limits, popup/dialog/download/
WebSocket restrictions, and permission denial are enforced by the scanner.
Byte limits and network isolation are not.

The scanner has no database dependency or database credentials. Its internal
HTTP service binds to `127.0.0.1` by default and requires a server-only bearer
token for `/internal/scans`. `/health` is liveness only; `/ready` reports whether
unrestricted isolated execution is approved.

## Controlled local validation

From the repository root:

```powershell
pnpm install
pnpm scanner:install-browser
pnpm scanner:typecheck
pnpm scanner:test
```

`scanner:install-browser` installs only the Chromium bundle required by
Playwright. The tests use deterministic fixture routes and injected DNS; they do
not contact arbitrary websites. The private worker is started with
`pnpm scanner:dev` after configuring `services/scanner/.env`; controlled mode
requires an exact hostname in `SCANNER_CONTROLLED_HOSTS`. There is no public
scanner endpoint or production scan command.

## Worker configuration

Copy `.env.example` to `.env` and set a strong random `SCANNER_INTERNAL_TOKEN`.
Keep `SCANNER_EXECUTION_MODE=controlled` for local development. Isolated mode
fails closed unless a root-owned, signed deployment attestation and independent
runtime evidence are present. `SCANNER_CAP_*` values are diagnostics only;
`verified` and `declared` values from the scanner process cannot establish
isolated readiness.

Linux isolated deployments use `SCANNER_ATTESTATION_PATH`,
`SCANNER_ATTESTATION_PUBLIC_KEY_PATH`, and
`SCANNER_BROWSER_SANDBOX_EVIDENCE_PATH`, plus `SCANNER_EGRESS_PROXY_URL` for
the mandatory browser proxy. The attestation is produced outside
the scanner process and covers firewall, proxy, resolver, and canary evidence.
The repository includes a VM boundary design under `infra/scanner-vm/`; it is
not applied to the Windows development machine.

Application checks do not solve DNS rebinding or provide network isolation. A
future scanner deployment needs an isolated, non-root execution environment with
explicit egress rules and per-request destination enforcement. The engine is for
controlled local development and fixtures only; public arbitrary-URL scanning is
not approved.

## Product Phase P3 evaluator

Product Phase P3 adds a deterministic in-process QA evaluator for `ScannerResult`
objects produced by controlled fixture scans. It checks navigation completion,
HTTP status, document title presence, console errors, page errors, and failed
requests. Findings are bounded, ordered, and kept internal to this package.

The evaluator is not exposed through the public API, mobile application, or
private scanner worker response. It does not persist findings or calculate a
score. Public scan summaries remain synthetic, arbitrary public URL scanning
remains disabled, and Phase H remains deferred pending verified scanner
isolation.

Product Phase P4 keeps the evaluator pure while importing its QA types from
`@siteprobe/contracts`. The API owns the separate `qa_evaluations` persistence
boundary; the scanner has no PostgreSQL dependency or database credentials and
does not call the internal persistence routes.

## Product Phase P7 controlled fixtures

The scanner exposes a narrow developer-only controlled-fixture façade used by
the separate `tools/controlled-evaluations` package. Its catalog contains only:

```text
healthy
missing-title
status-404
redirect-ok
navigation-timeout
console-error
failed-resource
```

`runControlledFixture()` accepts a catalog ID, never a URL or path, and reuses
the existing `fixture.invalid` resolver and Playwright route fulfillment. URL
safety, DNS/IP classification, redirect checks, method restrictions,
subresource policy, and resource limits still run before fulfillment. There is
no localhost exception, fixture server port, external DNS request, or arbitrary
destination fallback.

The scanner package does not read `QA_EVALUATION_INTERNAL_TOKEN`,
`DATABASE_URL`, or `SITEPROBE_TEST_DATABASE_URL`. The separate tool evaluates
the returned `ScannerResult` and uses the authenticated API ingestion route.
P7 does not use the private scanner worker, alter public synthetic scans, or
make Phase H production isolation-ready.

## Product Phase P8 accessibility evaluation

The `@siteprobe/scanner/controlled-accessibility` subpath exposes the separate
controlled accessibility seam. Its catalog contains only
`accessibility-clean`, `accessibility-missing-alt`, `accessibility-mixed`, and
`accessibility-navigation-timeout`; arbitrary URLs and target parameters are not
accepted. The runner performs one controlled Playwright navigation and invokes
`@axe-core/playwright@4.13.0` in legacy same-page mode with the fixed tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`. Axe cannot open a new
page or make a target request; the network-policy request counter is checked
before and after analysis.

Results are normalized into a bounded Accessibility Evaluation v1 contract.
Violations and needs-review entries are deterministically ordered, selector and
failure text are clipped, samples are capped, and the serialized payload is
limited to 48 KiB. The accessibility engine has no database or API credentials.
The separate developer tool performs authenticated persistence through the API.
