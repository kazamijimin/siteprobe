import { describe, expect, it } from "vitest";

import { ScannerSecurityError } from "../errors.js";
import { assertSafeDestination, type ScannerDnsResolver } from "./dns-policy.js";

function resolver(addresses: readonly string[]): ScannerDnsResolver {
  return { resolve: async () => addresses };
}

function failingResolver(): ScannerDnsResolver {
  return { resolve: async () => { throw new Error("resolver detail"); } };
}

describe("DNS safety policy", () => {
  it("allows public-only answers", async () => {
    await expect(
      assertSafeDestination("https://example.test/", resolver(["93.184.216.34"])),
    ).resolves.toMatchObject({ allowed: true, resolvedAddresses: ["93.184.216.34"] });
  });

  it.each([
    ["private only", ["127.0.0.1"]],
    ["mixed public and private", ["93.184.216.34", "10.0.0.1"]],
    ["public IPv4 and blocked IPv6", ["93.184.216.34", "::1"]],
  ])("rejects %s DNS answers", async (_label, addresses) => {
    await expect(
      assertSafeDestination("https://example.test/", resolver(addresses)),
    ).rejects.toMatchObject({ code: "UNSAFE_DNS_RESULT" });
  });

  it("rejects empty and failed DNS results without leaking resolver errors", async () => {
    await expect(
      assertSafeDestination("https://example.test/", resolver([])),
    ).rejects.toMatchObject({ code: "DNS_RESOLUTION_FAILED" });
    await expect(
      assertSafeDestination("https://example.test/", failingResolver()),
    ).rejects.toMatchObject({
      code: "DNS_RESOLUTION_FAILED",
      message: "Destination DNS resolution failed",
    });
  });

  it("does not resolve direct public IPs", async () => {
    const neverResolve: ScannerDnsResolver = {
      resolve: async () => { throw new Error("must not resolve"); },
    };
    await expect(
      assertSafeDestination("https://93.184.216.34/", neverResolve),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("rejects malformed resolver answers", async () => {
    await expect(
      assertSafeDestination("https://example.test/", resolver(["not-an-ip"])),
    ).rejects.toBeInstanceOf(ScannerSecurityError);
  });
});
