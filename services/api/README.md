# SiteProbe API

The API owns PostgreSQL persistence for the Phase D `scans` table and the
independent Product Phase P4 `qa_evaluations` JSONB snapshot table.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a dedicated local PostgreSQL database.
3. Apply migrations with `pnpm db:migrate`.
4. Start with `pnpm api:dev` from the repository root.

Phase G also provides an additive API scanner client configuration:

```env
SCANNER_URL=http://127.0.0.1:3100
SCANNER_INTERNAL_TOKEN=
QA_EVALUATION_INTERNAL_TOKEN=
```

These values are server-side only. The client is tested but intentionally not
called by `POST /api/scans`; the public route continues to return synthetic
results until a later isolation/integration phase.

The default API host is `127.0.0.1`. Database records survive API restarts. The API still creates deterministic synthetic scan results and never contacts the submitted website.

Product Phase P1 also exposes `GET /api/scans` for persisted scan history. It
returns newest-first records using bounded cursor pagination:

```text
GET /api/scans?limit=20
GET /api/scans?limit=20&cursor=<opaque-cursor>
```

The limit defaults to 20 and is bounded from 1 through 50. History retrieval
only queries PostgreSQL; it never invokes the scanner or resolves stored URLs.

Product Phase P2 adds server-backed literal, case-insensitive substring search
over both persisted URL forms:

```text
GET /api/scans?q=example
GET /api/scans?limit=20&q=example.com&cursor=<opaque-cursor>
```

The search query is trimmed, limited to 200 characters, and treats `%`, `_`,
and `\\` as literal characters. Search cursors are bound to the active query;
reusing a cursor with a different query returns a validation error. Search remains
database-only and never contacts stored URLs or invokes the scanner.

Local browser development requests from `http://localhost:<port>` and
`http://127.0.0.1:<port>` are allowed for the Expo web client. No public origins
are enabled.

Use `SITEPROBE_TEST_DATABASE_URL` for the opt-in PostgreSQL integration tests. Point it at a disposable dedicated test database; ordinary `pnpm check` and API route tests do not require a live database.

Product Phase P4 exposes only authenticated internal persistence routes:

```text
POST /internal/qa-evaluations
GET  /internal/qa-evaluations/:id
Authorization: Bearer <QA_EVALUATION_INTERNAL_TOKEN>
```

The token is server-only. If it is not configured, these routes return `503`
while the public API remains available. Creates are immutable and idempotent on
`(scannerRunId, evaluatorVersion)`; equivalent retries return `200`, conflicting
payloads return `409`, and stored contract corruption returns `500`. The routes
accept complete evaluator snapshots only—there is no URL-only ingestion, public
evaluation route, update/delete endpoint, score, scanner call, DNS lookup, or
browser launch.
