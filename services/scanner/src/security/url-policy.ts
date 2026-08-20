import { isIP } from "node:net";

import { ScannerSecurityError } from "../errors.js";
import { classifyIpAddress } from "./ip-policy.js";

const MAX_SCANNER_URL_LENGTH = 2048;

export type ScannerUrl = {
  normalizedUrl: string;
  protocol: "http:" | "https:";
  hostname: string;
  port: number | undefined;
  directIp: string | undefined;
};

function invalidUrl(message = "Destination URL is invalid"): never {
  throw new ScannerSecurityError("INVALID_URL", message);
}

export function parseScannerUrl(input: string): ScannerUrl {
  if (typeof input !== "string" || input.trim().length === 0) {
    return invalidUrl();
  }
  if (input.length > MAX_SCANNER_URL_LENGTH) {
    return invalidUrl("Destination URL exceeds the scanner limit");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return invalidUrl();
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScannerSecurityError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP and HTTPS destinations are supported",
    );
  }
  if (!parsed.hostname) return invalidUrl("Destination URL has no hostname");
  if (parsed.username || parsed.password) {
    throw new ScannerSecurityError(
      "CREDENTIALS_NOT_ALLOWED",
      "Destination URL credentials are not allowed",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const hostnameWithoutBrackets = hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (hostnameWithoutBrackets === "localhost" || hostnameWithoutBrackets === "localhost.") {
    throw new ScannerSecurityError("UNSAFE_IP", "Localhost destinations are not allowed");
  }

  const directIp = isIP(hostnameWithoutBrackets) ? hostnameWithoutBrackets : undefined;
  if (directIp) {
    const classification = classifyIpAddress(directIp);
    if (!classification || classification.blocked) {
      throw new ScannerSecurityError("UNSAFE_IP", "Destination IP is not allowed");
    }
  }

  // Fragments never reach an HTTP server and are removed from the canonical target.
  parsed.hash = "";
  return {
    normalizedUrl: parsed.toString(),
    protocol: parsed.protocol,
    hostname: hostnameWithoutBrackets,
    port: parsed.port ? Number(parsed.port) : undefined,
    directIp,
  };
}
