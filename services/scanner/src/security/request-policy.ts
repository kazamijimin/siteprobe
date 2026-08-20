import { ScannerSecurityError } from "../errors.js";
import { assertSafeDestination, type ScannerDnsResolver, type SafeDestination } from "./dns-policy.js";

export const ALLOWED_SCANNER_METHODS = ["GET", "HEAD"] as const;
export type ScannerRequestMethod = (typeof ALLOWED_SCANNER_METHODS)[number] | string;

export async function assertSafeRequestTarget(
  url: string,
  options: { method?: ScannerRequestMethod; resolver: ScannerDnsResolver },
): Promise<SafeDestination> {
  const method = (options.method ?? "GET").toUpperCase();
  if (!ALLOWED_SCANNER_METHODS.includes(method as (typeof ALLOWED_SCANNER_METHODS)[number])) {
    throw new ScannerSecurityError(
      "METHOD_NOT_ALLOWED",
      "Scanner requests are limited to passive GET and HEAD methods",
    );
  }
  return assertSafeDestination(url, options.resolver);
}

export const WEBSOCKETS_ALLOWED = false;
