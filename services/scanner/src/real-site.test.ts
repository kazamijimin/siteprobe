import { describe, expect, it } from "vitest";
import { parseRealSiteUrl, REAL_SITE_HOSTS } from "./real-site.js";
import { runScanWithPageInspector } from "./scan/run-scan.js";

describe("developer real-site target policy", () => {
  it("accepts only the exact ReaDirect hostnames and normalizes URLs with URL", () => {
    expect(REAL_SITE_HOSTS).toEqual(["readirect.org", "www.readirect.org"]);
    expect(parseRealSiteUrl("https://readirect.org:443/path?q=1#section")).toBe("https://readirect.org/path?q=1");
    expect(parseRealSiteUrl("https://www.readirect.org")).toBe("https://www.readirect.org/");
    expect(parseRealSiteUrl("http://readirect.org")).toBe("http://readirect.org/");
  });

  it.each([
    "https://google.com",
    "https://example.com",
    "http://127.0.0.1",
    "http://localhost",
    "https://readirect.org.evil.example",
    "https://evil-readirect.org",
    "ftp://readirect.org",
    "https://readirect.org.evil.example/?url=readirect.org",
    "https://user:pass@readirect.org",
  ])("rejects unsafe or non-allowlisted target %s", (target) => {
    expect(() => parseRealSiteUrl(target)).toThrow();
  });

  it("blocks a top-level redirect that escapes the ReaDirect allowlist", async () => {
    const result = await runScanWithPageInspector(
      { scanId: "5d41977d-ffb9-4388-af0a-0f74c8ee64ab", url: "https://readirect.org/" },
      async () => undefined,
      {
        resolver: { resolve: async () => ["93.184.216.34"] },
        topLevelNavigationHosts: REAL_SITE_HOSTS,
        testOnlyRouteHandler: async (route) => {
          if (route.request().url() === "https://readirect.org/") {
            await route.fulfill({ status: 200, contentType: "text/html", body: "<script>location.href='https://example.com/'</script>" });
            return true;
          }
          return false;
        },
      },
    );
    expect(result.scannerResult.navigationSucceeded).toBe(true);
    expect(result.scannerResult.failedRequests.some((request) => request.failureReason === "unsafe request target")).toBe(true);
  });
});
