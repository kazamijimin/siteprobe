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
