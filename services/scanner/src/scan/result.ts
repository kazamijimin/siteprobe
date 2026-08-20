import type { ScannerFailedRequest, ScannerResult } from "@siteprobe/contracts";

import { scannerResultSchema } from "@siteprobe/contracts";

const MAX_TEXT = 2048;
const MAX_TITLE = 512;

export function boundedText(value: string, max = MAX_TEXT): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function sanitizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "[unavailable-url]";
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.origin}${parsed.pathname}`.slice(0, MAX_TEXT);
  } catch {
    return "[invalid-url]";
  }
}

export function sanitizeTitle(value: string | null): string | null {
  if (value === null) return null;
  return boundedText(value, MAX_TITLE);
}

export function createFailedRequest(
  request: Pick<ScannerFailedRequest, "url" | "method" | "resourceType" | "failureReason">,
): ScannerFailedRequest {
  return {
    url: sanitizeUrl(request.url),
    method: boundedText(request.method, 16),
    resourceType: boundedText(request.resourceType, 64),
    failureReason: boundedText(request.failureReason, 512),
  };
}

export function validateScannerResult(result: ScannerResult): ScannerResult {
  return scannerResultSchema.parse(result);
}
