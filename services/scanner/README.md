# SiteProbe scanner safety boundary

This package contains the application-level policy and the first controlled
Playwright engine for accessing a user-supplied destination. The public API does
not call this engine. DNS lookups are only used by the explicit security-policy
API and are injectable in tests.

The policy validates HTTP(S) URLs, rejects credentials and local names, classifies
IPv4/IPv6 addresses (including IPv4-mapped IPv6), evaluates every DNS answer, and
provides reusable redirect and browser-request checks.

The `scannerResourcePolicy` object separates policy that is defined for Phase F
from controls that are actually enforced in this package. Browser execution,
request interception, navigation/job/request limits, popup/dialog/download/
WebSocket restrictions, and permission denial are enforced by the scanner.
Byte limits and network isolation are not.

The scanner has no database dependency or database credentials. If a later phase
adds an HTTP service, it must bind to `127.0.0.1` and use private authentication;
this package intentionally has no HTTP endpoint yet.

Application checks do not solve DNS rebinding or provide network isolation. A
future scanner deployment needs an isolated, non-root execution environment with
explicit egress rules and per-request destination enforcement. The engine is for
controlled local development and fixtures only; public arbitrary-URL scanning is
not approved.
