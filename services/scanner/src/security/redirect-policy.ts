import { ScannerSecurityError } from "../errors.js";
import { assertSafeDestination, type ScannerDnsResolver, type SafeDestination } from "./dns-policy.js";

export const MAX_REDIRECTS = 10;

export async function assertSafeRedirectTarget(
  redirectUrl: string,
  resolver: ScannerDnsResolver,
): Promise<SafeDestination> {
  try {
    return await assertSafeDestination(redirectUrl, resolver);
  } catch (error) {
    if (error instanceof ScannerSecurityError) {
      throw new ScannerSecurityError("UNSAFE_REDIRECT", "Redirect destination is not allowed", {
        causeCode: error.code,
      });
    }
    throw new ScannerSecurityError("UNSAFE_REDIRECT", "Redirect destination is not allowed");
  }
}
