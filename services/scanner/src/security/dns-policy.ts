import { lookup } from "node:dns/promises";

import { ScannerSecurityError } from "../errors.js";
import { classifyIpAddress } from "./ip-policy.js";
import { parseScannerUrl, type ScannerUrl } from "./url-policy.js";

export interface ScannerDnsResolver {
  resolve(hostname: string): Promise<readonly string[]>;
}

export const nodeDnsResolver: ScannerDnsResolver = {
  async resolve(hostname) {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  },
};

export type SafeDestination = {
  allowed: true;
  normalizedUrl: string;
  resolvedAddresses: readonly string[];
};

function allowedDestination(parsed: ScannerUrl, addresses: readonly string[]): SafeDestination {
  return { allowed: true, normalizedUrl: parsed.normalizedUrl, resolvedAddresses: addresses };
}

export async function assertSafeDestination(
  input: string,
  resolver: ScannerDnsResolver = nodeDnsResolver,
): Promise<SafeDestination> {
  const parsed = parseScannerUrl(input);
  if (parsed.directIp) return allowedDestination(parsed, [parsed.directIp]);

  let addresses: readonly string[];
  try {
    addresses = await resolver.resolve(parsed.hostname);
  } catch {
    throw new ScannerSecurityError(
      "DNS_RESOLUTION_FAILED",
      "Destination DNS resolution failed",
    );
  }

  const uniqueAddresses = [...new Set(addresses.map((address) => address.trim().toLowerCase()))];
  if (uniqueAddresses.length === 0) {
    throw new ScannerSecurityError(
      "DNS_RESOLUTION_FAILED",
      "Destination has no usable DNS addresses",
    );
  }

  for (const address of uniqueAddresses) {
    const classification = classifyIpAddress(address);
    if (!classification) {
      throw new ScannerSecurityError(
        "DNS_RESOLUTION_FAILED",
        "Destination DNS returned an invalid address",
      );
    }
    if (classification.blocked) {
      throw new ScannerSecurityError(
        "UNSAFE_DNS_RESULT",
        "Destination DNS returned a blocked address",
      );
    }
  }

  return allowedDestination(parsed, uniqueAddresses);
}

export const evaluateDestinationSafety = assertSafeDestination;
