import { chromium, type Browser } from "playwright";
import { describe, expect, it } from "vitest";

import { runScan } from "./scan/run-scan.js";
import {
  FIXTURE_URL,
  fixtureResolver,
  fixtureRouteHandler,
} from "./testing/fixtures.js";

const scanId = "5d41977d-ffb9-4388-af0a-0f74c8ee64ab";

async function runFixture(path = "/", options: Parameters<typeof runScan>[1] = {}) {
  return runScan(
    { scanId, url: `${FIXTURE_URL.replace(/\/$/, "")}${path}` },
    {
      resolver: fixtureResolver,
      testOnlyRouteHandler: fixtureRouteHandler,
      ...options,
    },
  );
}

describe("minimal Playwright scanner", () => {
  it("scans a controlled clean fixture and collects the title", async () => {
    const result = await runFixture();
    expect(result).toMatchObject({
      navigationSucceeded: true,
      httpStatus: 200,
      pageTitle: "Fixture Page",
    });
    expect(result.failureCode).toBeUndefined();
    expect(result.finalUrl).toBe(FIXTURE_URL);
    expect(result.navigationDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("collects console errors, page errors, and failed resources with bounds", async () => {
    const consoleResult = await runFixture("/console-error");
    expect(consoleResult.consoleErrors).toContain("fixture error");

    const pageErrorResult = await runFixture("/page-error");
    expect(pageErrorResult.pageErrors.join(" ")).toContain("fixture crash");

    const failedResult = await runFixture("/failed-resource");
    expect(failedResult.failedRequests.some((request) => request.url.endsWith("/fail.js"))).toBe(true);
  });

  it("preserves HTTP error statuses as successful navigations", async () => {
    const result = await runFixture("/status-500");
    expect(result.navigationSucceeded).toBe(true);
    expect(result.httpStatus).toBe(500);
  });

  it("dismisses dialogs, closes popups, blocks WebSockets, and cancels downloads", async () => {
    const dialogResult = await runFixture("/dialog");
    expect(dialogResult.navigationSucceeded).toBe(true);

    const popupResult = await runFixture("/popup");
    expect(popupResult.failedRequests.some((request) => request.failureReason === "popup blocked")).toBe(true);

    const websocketResult = await runFixture("/websocket");
    expect(websocketResult.failedRequests.some((request) => request.method === "WEBSOCKET")).toBe(true);

    const downloadResult = await runFixture("/download");
    expect(downloadResult.failedRequests.some((request) => request.failureReason === "downloads disabled")).toBe(true);
  });

  it("blocks an unsafe top-level destination before launching Chromium", async () => {
    let launches = 0;
    const result = await runScan(
      { scanId, url: "http://127.0.0.1/" },
      {
        browserLauncher: {
          launch: async () => {
            launches += 1;
            return chromium.launch({ headless: true });
          },
        },
      },
    );
    expect(result.failureCode).toBe("UNSAFE_TARGET");
    expect(launches).toBe(0);
  });

  it.each(["/private-subresource", "/metadata-subresource", "/ipv6-subresource"])(
    "aborts unsafe subresource requests for %s",
    async (path) => {
      const result = await runFixture(path);
      expect(result.navigationSucceeded).toBe(true);
      expect(result.failedRequests.some((request) => request.failureReason === "unsafe request target")).toBe(true);
    },
  );

  it.each(["/redirect-private", "/redirect-metadata", "/redirect-ipv6"])(
    "blocks unsafe redirect %s",
    async (path) => {
      const result = await runFixture(path);
      expect(result.navigationSucceeded).toBe(true);
      expect(result.failedRequests.some((request) => request.failureReason === "unsafe request target")).toBe(true);
    },
  );

  it("blocks POST requests while allowing the passive page navigation", async () => {
    const result = await runFixture("/post");
    expect(result.navigationSucceeded).toBe(true);
    expect(result.failedRequests.some((request) => request.method === "POST")).toBe(true);
  });

  it("enforces the request limit and returns a structured failure", async () => {
    const result = await runFixture("/request-limit", { limits: { maxRequests: 2 } });
    expect(result.failureCode).toBe("REQUEST_LIMIT_EXCEEDED");
    expect(result.failedRequests.length).toBeGreaterThan(0);
  });

  it("enforces the job deadline and closes browser resources", async () => {
    let launchedBrowser: Browser | undefined;
    const result = await runFixture("/slow", {
      limits: { jobTimeoutMs: 1500, navigationTimeoutMs: 5000 },
      browserLauncher: {
        launch: async () => {
          launchedBrowser = await chromium.launch({ headless: true });
          return launchedBrowser;
        },
      },
    });
    expect(result.failureCode).toBe("JOB_TIMEOUT");
    expect(launchedBrowser?.isConnected()).toBe(false);
  });

  it("keeps the service-worker policy enabled through the scanner context", async () => {
    const result = await runFixture("/sw");
    expect(result.navigationSucceeded).toBe(true);
  });
});
