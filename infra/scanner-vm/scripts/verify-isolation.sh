#!/usr/bin/env bash
set -euo pipefail

# Run only inside the dedicated scanner VM with controlled canaries. Every
# protected target must be explicitly configured; this script never guesses or
# probes unrelated LAN addresses and never contacts real cloud metadata.
: "${PUBLIC_CANARY_URL:?set PUBLIC_CANARY_URL to a controlled public fixture}"
: "${PROXY_URL:?set PROXY_URL to the mandatory egress proxy}"
: "${HOST_CANARY_HOST:?set HOST_CANARY_HOST to a controlled host listener}"
: "${PRIVATE_CANARY_HOST:?set PRIVATE_CANARY_HOST to a controlled private listener}"
: "${DB_CANARY_HOST:?set DB_CANARY_HOST to a controlled database-port canary}"
: "${METADATA_CANARY_URL:?set METADATA_CANARY_URL to a mock metadata canary}"
: "${IPV6_CANARY_HOST:?set IPV6_CANARY_HOST to a controlled ULA/link-local canary}"
: "${CONTROLLED_RESOLVER:?set CONTROLLED_RESOLVER to the approved resolver address}"

failures=0
expect_blocked() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: $label was reachable"
    failures=$((failures + 1))
  else
    echo "PASS: $label blocked"
  fi
}

curl --fail --silent --show-error --proxy "$PROXY_URL" "$PUBLIC_CANARY_URL" >/dev/null
echo "PASS: public canary reachable through proxy"
expect_blocked "direct public HTTP" curl --noproxy '*' --connect-timeout 3 "$PUBLIC_CANARY_URL"
expect_blocked "host canary" nc -z -w 3 "$HOST_CANARY_HOST" 80
expect_blocked "private canary" nc -z -w 3 "$PRIVATE_CANARY_HOST" 80
expect_blocked "database-port canary" nc -z -w 3 "$DB_CANARY_HOST" 5432
expect_blocked "mock metadata canary" curl --noproxy '*' --connect-timeout 3 "$METADATA_CANARY_URL"
expect_blocked "IPv6 protected canary" nc -6 -z -w 3 "$IPV6_CANARY_HOST" 80
expect_blocked "arbitrary DNS resolver" dig +time=2 +tries=1 @8.8.8.8 example.com
dig +time=2 +tries=1 @"$CONTROLLED_RESOLVER" example.com >/dev/null
echo "PASS: controlled resolver reachable"

if (( failures > 0 )); then
  echo "$failures isolation checks failed" >&2
  exit 1
fi
