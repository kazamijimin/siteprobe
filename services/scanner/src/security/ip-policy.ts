import { isIP } from "node:net";

export type IpFamily = 4 | 6;

export type IpBlockReason =
  | "loopback"
  | "private"
  | "link-local"
  | "unspecified"
  | "multicast"
  | "carrier-grade-nat"
  | "reserved"
  | "documentation"
  | "ipv4-mapped-blocked";

export type IpClassification = {
  address: string;
  family: IpFamily;
  blocked: boolean;
  reason?: IpBlockReason;
};

type Cidr = { family: IpFamily; network: bigint; mask: bigint };

function ipv4ToBigInt(address: string): bigint {
  return address.split(".").reduce((value, part) => value * 256n + BigInt(part), 0n);
}

function parseIpv4(address: string): bigint | undefined {
  if (isIP(address) !== 4) return undefined;
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return undefined;
  }
  const values = parts.map(Number);
  if (values.some((value) => value > 255)) return undefined;
  return ipv4ToBigInt(address);
}

function parseIpv6(address: string): bigint | undefined {
  if (isIP(address) !== 6) return undefined;
  const lower = address.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return undefined;

  const expand = (part: string): number[] => {
    if (!part) return [];
    const tokens = part.split(":");
    const values: number[] = [];
    for (const token of tokens) {
      if (token.includes(".")) {
        const ipv4 = parseIpv4(token);
        if (ipv4 === undefined) throw new Error("invalid embedded IPv4");
        values.push(Number((ipv4 >> 16n) & 0xffffn), Number(ipv4 & 0xffffn));
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(token)) throw new Error("invalid IPv6 group");
        values.push(Number.parseInt(token, 16));
      }
    }
    return values;
  };

  try {
    const left = expand(halves[0] ?? "");
    const right = expand(halves[1] ?? "");
    const groups =
      halves.length === 2
        ? [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right]
        : left;
    if (groups.length !== 8) return undefined;
    return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
  } catch {
    return undefined;
  }
}

function cidr(family: IpFamily, network: string, prefix: number): Cidr {
  const value = family === 4 ? parseIpv4(network) : parseIpv6(network);
  if (value === undefined) throw new Error(`Invalid ${family === 4 ? "IPv4" : "IPv6"} CIDR`);
  const bits = BigInt(family === 4 ? 32 : 128);
  const mask = prefix === 0 ? 0n : ((1n << bits) - 1n) ^ ((1n << (bits - BigInt(prefix))) - 1n);
  return { family, network: value & mask, mask };
}

function inCidr(value: bigint, range: Cidr): boolean {
  return (value & range.mask) === range.network;
}

const blockedIpv4: Array<[Cidr, IpBlockReason]> = [
  [cidr(4, "0.0.0.0", 8), "unspecified"],
  [cidr(4, "10.0.0.0", 8), "private"],
  [cidr(4, "100.64.0.0", 10), "carrier-grade-nat"],
  [cidr(4, "127.0.0.0", 8), "loopback"],
  [cidr(4, "169.254.0.0", 16), "link-local"],
  [cidr(4, "172.16.0.0", 12), "private"],
  [cidr(4, "192.0.0.0", 24), "reserved"],
  [cidr(4, "192.0.2.0", 24), "documentation"],
  [cidr(4, "192.168.0.0", 16), "private"],
  [cidr(4, "198.18.0.0", 15), "reserved"],
  [cidr(4, "198.51.100.0", 24), "documentation"],
  [cidr(4, "203.0.113.0", 24), "documentation"],
  [cidr(4, "224.0.0.0", 4), "multicast"],
  [cidr(4, "240.0.0.0", 4), "reserved"],
];

const blockedIpv6: Array<[Cidr, IpBlockReason]> = [
  [cidr(6, "::", 128), "unspecified"],
  [cidr(6, "::1", 128), "loopback"],
  [cidr(6, "fc00::", 7), "private"],
  [cidr(6, "fe80::", 10), "link-local"],
  [cidr(6, "ff00::", 8), "multicast"],
  [cidr(6, "2001:db8::", 32), "documentation"],
];

export function classifyIpAddress(address: string): IpClassification | undefined {
  const normalized = address.trim().toLowerCase();
  const family = isIP(normalized) as IpFamily;
  if (family !== 4 && family !== 6) return undefined;

  const value = family === 4 ? parseIpv4(normalized) : parseIpv6(normalized);
  if (value === undefined) return undefined;

  const ranges = family === 4 ? blockedIpv4 : blockedIpv6;
  for (const [range, reason] of ranges) {
    if (inCidr(value, range)) {
      return { address: normalized, family, blocked: true, reason };
    }
  }

  if (family === 6 && value >> 32n === 0xffffn) {
    const mapped = Number(value & 0xffffffffn);
    const mappedAddress = `${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`;
    const mappedClassification = classifyIpAddress(mappedAddress);
    if (mappedClassification?.blocked) {
      return {
        address: normalized,
        family,
        blocked: true,
        reason: "ipv4-mapped-blocked",
      };
    }
  }

  return { address: normalized, family, blocked: false };
}

export function isBlockedIpAddress(address: string): boolean {
  return classifyIpAddress(address)?.blocked ?? true;
}
