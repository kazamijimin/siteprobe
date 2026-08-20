import { describe, expect, it } from "vitest";

import { classifyIpAddress } from "./ip-policy.js";

describe("IP safety policy", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
  ])("blocks IPv4 %s", (address) => {
    expect(classifyIpAddress(address)?.blocked).toBe(true);
  });

  it.each(["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1"])(
    "blocks IPv6 %s",
    (address) => {
      expect(classifyIpAddress(address)?.blocked).toBe(true);
    },
  );

  it.each(["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1"])(
    "blocks mapped address %s",
    (address) => {
      expect(classifyIpAddress(address)?.blocked).toBe(true);
    },
  );

  it.each(["93.184.216.34", "2001:4860:4860::8888"])(
    "allows representative public address %s",
    (address) => {
      expect(classifyIpAddress(address)).toMatchObject({ blocked: false });
    },
  );
});
