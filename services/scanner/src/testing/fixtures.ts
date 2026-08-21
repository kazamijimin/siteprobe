import type { Route } from "playwright";

export const FIXTURE_HOST = "fixture.invalid";
export const FIXTURE_URL = `http://${FIXTURE_HOST}/`;
export const FIXTURE_ADDRESS = "93.184.216.34";

export const fixtureResolver = {
  async resolve(hostname: string): Promise<readonly string[]> {
    if (hostname === FIXTURE_HOST) return [FIXTURE_ADDRESS];
    return [];
  },
};

const pages: Record<string, string> = {
  "/": '<!doctype html><title>Fixture Page</title><h1>Hello</h1>',
  "/missing-title": '<!doctype html><h1>Missing title fixture</h1>',
  "/console-error": '<!doctype html><title>Console Fixture</title><script>console.error("fixture error")</script>',
  "/page-error": '<!doctype html><title>Page Error Fixture</title><script>setTimeout(() => { throw new Error("fixture crash") }, 0)</script>',
  "/failed-resource": '<!doctype html><title>Failed Resource Fixture</title><script src="http://fixture.invalid/fail.js"></script>',
  "/popup": '<!doctype html><title>Popup Fixture</title><script>window.open("http://fixture.invalid/popup-child")</script>',
  "/dialog": '<!doctype html><title>Dialog Fixture</title><script>alert("fixture dialog")</script>',
  "/post": '<!doctype html><title>POST Fixture</title><script>fetch("http://fixture.invalid/post-target", { method: "POST" }).catch(() => {})</script>',
  "/websocket": '<!doctype html><title>WebSocket Fixture</title><script>new WebSocket("ws://fixture.invalid/socket")</script>',
  "/private-subresource": '<!doctype html><title>Private Resource Fixture</title><img src="http://127.0.0.1/private">',
  "/metadata-subresource": '<!doctype html><title>Metadata Resource Fixture</title><img src="http://169.254.169.254/metadata">',
  "/ipv6-subresource": '<!doctype html><title>IPv6 Resource Fixture</title><img src="http://[::1]/private">',
  "/request-limit": '<!doctype html><title>Request Limit Fixture</title><img src="http://fixture.invalid/a"><img src="http://fixture.invalid/b"><img src="http://fixture.invalid/c">',
  "/status-404": '<!doctype html><title>Not Found Fixture</title><h1>404</h1>',
  "/status-500": '<!doctype html><title>Server Error Fixture</title><h1>500</h1>',
  "/redirect-ok": '<!doctype html><title>Redirect Fixture</title><script>location.replace("http://fixture.invalid/redirect-target")</script>',
  "/redirect-target": '<!doctype html><title>Redirect Target Fixture</title><h1>Redirected</h1>',
  "/download": '<!doctype html><title>Download Fixture</title><a download href="/file.bin" id="download">download</a><script>document.getElementById("download").click()</script>',
  "/sw": '<!doctype html><title>Service Worker Fixture</title><script>navigator.serviceWorker.register("/sw.js").catch(() => {})</script>',
};

async function fulfillPage(route: Route, pathname: string): Promise<void> {
  if (pathname === "/fail.js") {
    await route.abort("failed");
    return;
  }
  if (pathname === "/redirect-private") {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<script>location.replace("http://127.0.0.1/private")</script>',
    });
    return;
  }
  if (pathname === "/redirect-ok") {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: pages[pathname],
    });
    return;
  }
  if (pathname === "/redirect-metadata") {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<script>location.replace("http://169.254.169.254/")</script>',
    });
    return;
  }
  if (pathname === "/redirect-ipv6") {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<script>location.replace("http://[::1]/")</script>',
    });
    return;
  }
  if (pathname === "/file.bin") {
    await route.fulfill({
      status: 200,
      headers: { "content-disposition": "attachment; filename=fixture.bin" },
      body: "fixture download",
    });
    return;
  }
  if (pathname === "/sw.js") {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "self.addEventListener('fetch', () => {})" });
    return;
  }
  await route.fulfill({
    status: pathname === "/status-500" ? 500 : pathname === "/status-404" ? 404 : 200,
    contentType: "text/html",
    body: pages[pathname] ?? "<!doctype html><title>Fixture Child</title>",
  });
}

/** Test-only routing hook. It runs only after the scanner policy allows a request. */
export async function fixtureRouteHandler(route: Route): Promise<boolean> {
  const url = new URL(route.request().url());
  if (url.hostname !== FIXTURE_HOST) return false;
  if (url.pathname === "/slow") {
    await new Promise<void>(() => undefined);
    return true;
  }
  await fulfillPage(route, url.pathname);
  return true;
}
