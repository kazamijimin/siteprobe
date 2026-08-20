import type { ScannerSecurityFailureCode } from "@siteprobe/contracts";

export const scannerSecurityErrorCodes = [
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "CREDENTIALS_NOT_ALLOWED",
  "UNSAFE_IP",
  "UNSAFE_DNS_RESULT",
  "DNS_RESOLUTION_FAILED",
  "UNSAFE_REDIRECT",
  "METHOD_NOT_ALLOWED",
  "WEBSOCKET_BLOCKED",
] as const satisfies readonly ScannerSecurityFailureCode[];

export type ScannerSecurityErrorCode = ScannerSecurityFailureCode;

export class ScannerSecurityError extends Error {
  readonly code: ScannerSecurityErrorCode;
  readonly causeCode?: ScannerSecurityErrorCode;

  constructor(
    code: ScannerSecurityErrorCode,
    message: string,
    options?: { causeCode?: ScannerSecurityErrorCode },
  ) {
    super(message);
    this.name = "ScannerSecurityError";
    this.code = code;
    this.causeCode = options?.causeCode;
  }
}

export const scannerRunFailureCodes = [
  "UNSAFE_TARGET",
  "DNS_FAILURE",
  "NAVIGATION_TIMEOUT",
  "NAVIGATION_FAILED",
  "REQUEST_LIMIT_EXCEEDED",
  "JOB_TIMEOUT",
  "BROWSER_LAUNCH_FAILED",
  "BROWSER_CRASHED",
] as const;

export type ScannerRunFailureCode = (typeof scannerRunFailureCodes)[number];

export class ScannerExecutionError extends Error {
  readonly code: ScannerRunFailureCode;

  constructor(code: ScannerRunFailureCode, message: string) {
    super(message);
    this.name = "ScannerExecutionError";
    this.code = code;
  }
}
