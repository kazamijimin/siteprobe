import {
  scannerResultSchema,
  scannerValidationRequestSchema,
  type ScannerResult,
} from "@siteprobe/contracts";
import { performance } from "node:perf_hooks";
import type { Browser, BrowserContext, Page } from "playwright";

import { chromiumLauncher, type BrowserLauncher } from "../browser/browser.js";
import { createScannerContext } from "../browser/context.js";
import {
  appendPopupDiagnostic,
  createNetworkPolicyState,
  installNetworkPolicy,
  type TestOnlyRouteHandler,
  type NetworkPolicyState,
} from "../browser/network-policy.js";
import { ScannerExecutionError, ScannerSecurityError } from "../errors.js";
import {
  assertSafeDestination,
  nodeDnsResolver,
  type ScannerDnsResolver,
} from "../security/dns-policy.js";
import { scannerResourcePolicy } from "../security/limits.js";
import { boundedText, createFailedRequest, sanitizeTitle, sanitizeUrl } from "./result.js";

export type ScannerRunInput = {
  scanId: string;
  url: string;
};

export type ScannerRunLimits = {
  navigationTimeoutMs: number;
  jobTimeoutMs: number;
  actionTimeoutMs: number;
  maxRedirects: number;
  maxRecordedErrors: number;
  maxRequests: number;
};

export type ScannerRunOptions = {
  resolver?: ScannerDnsResolver;
  browserLauncher?: BrowserLauncher;
  limits?: Partial<ScannerRunLimits>;
  now?: () => Date;
  /** Test-only fixture routing. Production callers must leave this unset. */
  testOnlyRouteHandler?: TestOnlyRouteHandler;
};

type MutableResources = {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
};

function runtimeLimits(overrides?: Partial<ScannerRunLimits>): ScannerRunLimits {
  return { ...scannerResourcePolicy.defined, ...overrides };
}

function failureResult(
  input: ScannerRunInput,
  code: ScannerResult["failureCode"],
  now: () => Date,
  requestedUrl = sanitizeUrl(input.url),
  state?: NetworkPolicyState,
): ScannerResult {
  return scannerResultSchema.parse({
    scanId: input.scanId,
    requestedUrl,
    finalUrl: requestedUrl === "[invalid-url]" ? null : requestedUrl,
    navigationSucceeded: false,
    httpStatus: null,
    pageTitle: null,
    navigationDurationMs: 0,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: state?.failedRequests ?? [],
    scannedAt: now().toISOString(),
    failureCode: code,
  });
}

async function closeQuietly(resource: { close: () => Promise<void> } | undefined): Promise<void> {
  if (!resource) return;
  try {
    await resource.close();
  } catch {
    // Cleanup must not mask the scan result or primary failure.
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (/timeout/i.test(error.message) || error.name === "TimeoutError");
}

function collectPageEvents(
  page: Page,
  context: BrowserContext,
  state: NetworkPolicyState,
  policy: ScannerRunLimits,
  consoleErrors: string[],
  pageErrors: string[],
): void {
  page.on("console", (message) => {
    if (message.type() === "error" && consoleErrors.length < policy.maxRecordedErrors) {
      consoleErrors.push(boundedText(message.text()));
    }
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length < policy.maxRecordedErrors) {
      pageErrors.push(boundedText(error.message));
    }
  });
  page.on("requestfailed", (request) => {
    if (state.failedRequests.length < policy.maxRecordedErrors) {
      state.failedRequests.push(
        createFailedRequest({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          failureReason: request.failure()?.errorText ?? "request failed",
        }),
      );
    }
  });
  page.on("dialog", (dialog) => {
    void dialog.dismiss().catch(() => undefined);
  });
  page.on("download", (download) => {
    void download.cancel().catch(() => undefined);
    if (state.failedRequests.length < policy.maxRecordedErrors) {
      state.failedRequests.push(
        createFailedRequest({
          url: download.url(),
          method: "DOWNLOAD",
          resourceType: "download",
          failureReason: "downloads disabled",
        }),
      );
    }
  });
  context.on("page", (popup) => {
    if (popup === page) return;
    appendPopupDiagnostic(state, popup.url(), policy.maxRecordedErrors);
    void popup.close().catch(() => undefined);
  });
}

async function executeScan(
  input: ScannerRunInput,
  resources: MutableResources,
  state: NetworkPolicyState,
  policy: ScannerRunLimits,
  options: ScannerRunOptions,
  now: () => Date,
  isCancelled: () => boolean,
): Promise<ScannerResult> {
  const resolver = options.resolver ?? nodeDnsResolver;
  let safeDestination;
  try {
    safeDestination = await assertSafeDestination(input.url, resolver);
  } catch (error) {
    const failureCode =
      error instanceof ScannerSecurityError && error.code === "DNS_RESOLUTION_FAILED"
        ? "DNS_FAILURE"
        : "UNSAFE_TARGET";
    return failureResult(input, failureCode, now);
  }
  if (isCancelled()) throw new ScannerExecutionError("JOB_TIMEOUT", "Scanner job timed out");

  try {
    resources.browser = await (options.browserLauncher ?? chromiumLauncher).launch();
  } catch {
    throw new ScannerExecutionError("BROWSER_LAUNCH_FAILED", "Chromium could not be launched");
  }
  if (isCancelled()) throw new ScannerExecutionError("JOB_TIMEOUT", "Scanner job timed out");

  resources.context = await createScannerContext(resources.browser);
  await installNetworkPolicy(
    resources.context,
    resolver,
    { ...scannerResourcePolicy.defined, ...policy },
    state,
    () => resources.page,
    options.testOnlyRouteHandler,
  );
  resources.page = await resources.context.newPage();
  resources.page.setDefaultNavigationTimeout(policy.navigationTimeoutMs);
  resources.page.setDefaultTimeout(policy.actionTimeoutMs);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageEvents(resources.page, resources.context, state, policy, consoleErrors, pageErrors);

  const startedAt = performance.now();
  let responseStatus: number | null = null;
  let navigationSucceeded = false;
  let failureCode: ScannerResult["failureCode"];
  try {
    const response = await resources.page.goto(safeDestination.normalizedUrl, {
      waitUntil: "load",
      timeout: policy.navigationTimeoutMs,
    });
    responseStatus = response?.status() ?? null;
    navigationSucceeded = true;
    await resources.page.waitForTimeout(Math.min(25, policy.actionTimeoutMs));
  } catch (error) {
    failureCode = state.requestLimitExceeded
      ? "REQUEST_LIMIT_EXCEEDED"
      : isTimeout(error)
        ? "NAVIGATION_TIMEOUT"
        : "NAVIGATION_FAILED";
  }

  const navigationDurationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const finalUrl = sanitizeUrl(resources.page.url());
  let pageTitle: string | null = null;
  try {
    pageTitle = sanitizeTitle(await resources.page.title());
  } catch {
    pageTitle = null;
  }

  if (state.requestLimitExceeded) failureCode = "REQUEST_LIMIT_EXCEEDED";
  return scannerResultSchema.parse({
    scanId: input.scanId,
    requestedUrl: sanitizeUrl(safeDestination.normalizedUrl),
    finalUrl: finalUrl === "[invalid-url]" ? safeDestination.normalizedUrl : finalUrl,
    navigationSucceeded,
    httpStatus: responseStatus,
    pageTitle,
    navigationDurationMs,
    consoleErrors,
    pageErrors,
    failedRequests: state.failedRequests.slice(0, policy.maxRecordedErrors),
    scannedAt: now().toISOString(),
    ...(failureCode ? { failureCode } : {}),
  });
}

export async function runScan(
  rawInput: ScannerRunInput,
  options: ScannerRunOptions = {},
): Promise<ScannerResult> {
  const input = scannerValidationRequestSchema.parse(rawInput);
  const policy = runtimeLimits(options.limits);
  const now = options.now ?? (() => new Date());
  const resources: MutableResources = {};
  const state = createNetworkPolicyState();
  let cancelled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const execution = executeScan(input, resources, state, policy, options, now, () => cancelled);
  execution.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      cancelled = true;
      reject(new ScannerExecutionError("JOB_TIMEOUT", "Scanner job timed out"));
    }, policy.jobTimeoutMs);
  });

  try {
    return await Promise.race([execution, timeout]);
  } catch (error) {
    const code = error instanceof ScannerExecutionError ? error.code : "BROWSER_CRASHED";
    return failureResult(input, code, now, sanitizeUrl(input.url), state);
  } finally {
    cancelled = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await closeQuietly(resources.page);
    await closeQuietly(resources.context);
    await closeQuietly(resources.browser);
  }
}
