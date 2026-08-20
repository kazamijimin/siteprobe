import { describe, expect, it } from "vitest";

import { assertSafeRedirectTarget } from "./redirect-policy.js";
import { assertSafeRequestTarget } from "./request-policy.js";
import type { ScannerDnsResolver } from "./dns-policy.js";

const publicResolver: ScannerDnsResolver = {
  resolve: async (hostname) =>
    hostname === "safe.example" || hostname === "public.example"
      ? ["93.184.216.34"]
      : [],
};

describe("redirect and browser request policies", () => {
  it("re-validates safe redirect destinations", async () => {
    await expect(
      assertSafeRedirectTarget("https://safe.example/", publicResolver),
    ).resolves.toMatchObject({ allowed: true });
  });

  it.each(["http://127.0.0.1/", "http://169.254.169.254/", "http://[::1]/"])(
    "blocks unsafe redirect %s",
    async (url) => {
      await expect(assertSafeRedirectTarget(url, publicResolver)).rejects.toMatchObject({
        code: "UNSAFE_REDIRECT",
      });
    },
  );

  it("allows passive GET/HEAD and blocks state-changing methods", async () => {
    await expect(
      assertSafeRequestTarget("https://safe.example/", {
        method: "GET",
        resolver: publicResolver,
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      assertSafeRequestTarget("https://safe.example/", {
        method: "HEAD",
        resolver: publicResolver,
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      assertSafeRequestTarget("https://safe.example/", {
        method: "POST",
        resolver: publicResolver,
      }),
    ).rejects.toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  });
});
