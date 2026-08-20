import type { BrowserContext, Page, Route, WebSocketRoute } from "playwright";

import { assertSafeRequestTarget } from "../security/request-policy.js";
import { assertSafeRedirectTarget } from "../security/redirect-policy.js";
import type { ScannerDnsResolver } from "../security/dns-policy.js";
import { createFailedRequest } from "../scan/result.js";

type NetworkLimits = {
  maxRequests: number;
  maxRecordedErrors: number;
  maxRedirects: number;
};

export type NetworkPolicyState = {
  requestCount: number;
  requestLimitExceeded: boolean;
  blockedWebSockets: number;
  blockedPopups: number;
  failedRequests: ReturnType<typeof createFailedRequest>[];
  lastBlockReason?: string;
};

export type TestOnlyRouteHandler = (route: Route) => Promise<boolean>;

export function createNetworkPolicyState(): NetworkPolicyState {
  return {
    requestCount: 0,
    requestLimitExceeded: false,
    blockedWebSockets: 0,
    blockedPopups: 0,
    failedRequests: [],
  };
}

function redirectDepth(route: Route): number {
  let depth = 0;
  let current = route.request().redirectedFrom();
  while (current) {
    depth += 1;
    current = current.redirectedFrom();
  }
  return depth;
}

function recordFailure(
  state: NetworkPolicyState,
  failure: Parameters<typeof createFailedRequest>[0],
  maxRecordedErrors: number,
): void {
  if (state.failedRequests.length < maxRecordedErrors) {
    state.failedRequests.push(createFailedRequest(failure));
  }
}

async function abortRoute(route: Route): Promise<void> {
  try {
    await route.abort("blockedbyclient");
  } catch {
    // The page may already have closed while a request was being cancelled.
  }
}

export async function installNetworkPolicy(
  context: BrowserContext,
  resolver: ScannerDnsResolver,
  policy: NetworkLimits,
  state: NetworkPolicyState,
  getPage: () => Page | undefined,
  testOnlyRouteHandler?: TestOnlyRouteHandler,
): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    state.requestCount += 1;

    if (state.requestCount > policy.maxRequests) {
      state.requestLimitExceeded = true;
      state.lastBlockReason = "request limit exceeded";
      recordFailure(
        state,
        {
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          failureReason: "request limit exceeded",
        },
        policy.maxRecordedErrors,
      );
      await abortRoute(route);
      void getPage()?.close().catch(() => undefined);
      return;
    }

    if (redirectDepth(route) > policy.maxRedirects) {
      state.lastBlockReason = "redirect limit exceeded";
      recordFailure(
        state,
        {
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          failureReason: "redirect limit exceeded",
        },
        policy.maxRecordedErrors,
      );
      await abortRoute(route);
      return;
    }

    try {
      if (request.redirectedFrom()) {
        await assertSafeRedirectTarget(request.url(), resolver);
      } else {
        await assertSafeRequestTarget(request.url(), {
          method: request.method(),
          resolver,
        });
      }
      if (testOnlyRouteHandler && await testOnlyRouteHandler(route)) return;
      await route.continue();
    } catch (error) {
      state.lastBlockReason = error instanceof Error ? error.message : "unsafe request target";
      recordFailure(
        state,
        {
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          failureReason: "unsafe request target",
        },
        policy.maxRecordedErrors,
      );
      await abortRoute(route);
    }
  });

  await context.routeWebSocket(() => true, async (webSocket: WebSocketRoute) => {
    state.blockedWebSockets += 1;
    state.lastBlockReason = "websocket blocked";
    recordFailure(
      state,
      {
        url: webSocket.url(),
        method: "WEBSOCKET",
        resourceType: "websocket",
        failureReason: "websocket blocked",
      },
      policy.maxRecordedErrors,
    );
    await webSocket.close({ code: 1008, reason: "WebSockets are disabled" });
  });
}

export function appendPopupDiagnostic(state: NetworkPolicyState, url: string, max: number): void {
  state.blockedPopups += 1;
  recordFailure(
    state,
    {
      url,
      method: "POPUP",
      resourceType: "popup",
      failureReason: "popup blocked",
    },
    max,
  );
}
