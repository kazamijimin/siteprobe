import { describe, expect, it } from "vitest";

import { ScannerSecurityError } from "../errors.js";
import { parseScannerUrl } from "./url-policy.js";

function errorCode(input: string): string | undefined {
  try {
    parseScannerUrl(input);
    return undefined;
  } catch (error) {
    return error instanceof ScannerSecurityError ? error.code : "UNKNOWN";
  }
}

describe("scanner URL policy", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/plain,test",
    "ws://example.com",
    "wss://example.com",
  ])("rejects unsupported scheme %s", (url) => {
    expect(errorCode(url)).toBe("UNSUPPORTED_PROTOCOL");
  });

  it("rejects credentials and local destinations", () => {
    expect(errorCode("http://user:pass@example.com")).toBe("CREDENTIALS_NOT_ALLOWED");
    expect(errorCode("http://localhost/")).toBe("UNSAFE_IP");
    expect(errorCode("http://localhost./")).toBe("UNSAFE_IP");
  });

  it("rejects malformed ports", () => {
    expect(errorCode("https://example.com:99999/")).toBe("INVALID_URL");
  });

  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://127.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
  ])("rejects direct private or obfuscated destination %s", (url) => {
    expect(errorCode(url)).toBe("UNSAFE_IP");
  });

  it("normalizes fragments without sending them to a server", () => {
    expect(parseScannerUrl("https://Example.com/path#secret").normalizedUrl).toBe(
      "https://example.com/path",
    );
  });

  it("accepts HTTP and HTTPS public destinations", () => {
    expect(parseScannerUrl("http://93.184.216.34/").directIp).toBe("93.184.216.34");
    expect(parseScannerUrl("https://example.com/").hostname).toBe("example.com");
  });
});
