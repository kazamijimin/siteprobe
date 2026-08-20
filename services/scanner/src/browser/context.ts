import type { Browser, BrowserContext } from "playwright";

export async function createScannerContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    serviceWorkers: "block",
    ignoreHTTPSErrors: false,
    acceptDownloads: false,
  });
}
