# SiteProbe API

The API owns PostgreSQL persistence for the Phase D `scans` table.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a dedicated local PostgreSQL database.
3. Apply migrations with `pnpm db:migrate`.
4. Start with `pnpm api:dev` from the repository root.

Phase G also provides an additive API scanner client configuration:

```env
SCANNER_URL=http://127.0.0.1:3100
SCANNER_INTERNAL_TOKEN=
```

These values are server-side only. The client is tested but intentionally not
called by `POST /api/scans`; the public route continues to return synthetic
results until a later isolation/integration phase.

The default API host is `127.0.0.1`. Database records survive API restarts. The API still creates deterministic synthetic scan results and never contacts the submitted website.

Local browser development requests from `http://localhost:<port>` and
`http://127.0.0.1:<port>` are allowed for the Expo web client. No public origins
are enabled.

Use `SITEPROBE_TEST_DATABASE_URL` for the opt-in PostgreSQL integration tests. Point it at a disposable dedicated test database; ordinary `pnpm check` and API route tests do not require a live database.
