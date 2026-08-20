# SiteProbe dedicated scanner VM boundary

This directory is a deployment definition for the Phase G.5 Linux scanner
boundary. It is intentionally not applied by the Windows development scripts
and it does not provision a cloud VM, firewall, proxy, resolver, or credentials.

The intended topology is:

```text
Fastify API
    ↓ private authenticated control path
Dedicated Linux VM
    ↓ nftables default-deny output policy
Controlled resolver + mandatory egress proxy
    ↓
Public HTTP/HTTPS only
```

The scanner service runs as `siteprobe-scanner`, without a database URL,
Docker/Podman socket, host mounts, cloud credentials, or `--no-sandbox`.
`nftables/siteprobe.nft` restricts scanner-originated new connections to the
resolver and proxy. The proxy independently rejects protected and non-global
destination ranges. The resolver and proxy addresses must be replaced with the
actual private addresses for the selected VM network before deployment.
The checked-in protected range list is a reviewable baseline; deployment must
refresh it from the maintained IANA special-purpose/global-unicast registries
and include the resulting policy hash in the signed attestation.

## Deployment order

1. Provision one dedicated Linux VM and a private API-to-scanner control path.
2. Create only the `siteprobe-scanner` unprivileged account and the narrow
   directories listed in the systemd unit.
3. Install and review the nftables, resolver, and proxy policy as one change.
4. Install Chromium for Playwright without disabling its sandbox.
5. Run `scripts/verify-isolation.sh` and the application-bypass harness from
   inside the VM using only controlled canary endpoints.
6. Produce a signed deployment attestation outside the scanner process. Store
   it and its public key root-owned and non-writable by the scanner account.
7. Set `SCANNER_EXECUTION_MODE=isolated` only after all checks pass. `/ready`
   remains `503` without a fresh valid attestation and runtime evidence.

The supplied files are a reviewable baseline, not proof that a VM is isolated.
Do not mark a deployment ready until the commands have run on the real VM.
