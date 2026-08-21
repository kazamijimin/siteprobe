const REAL_SITE_HOSTS = new Set(["readirect.org", "www.readirect.org"]);

export function isControlledEvaluationUrl(value: string | null, realSiteSmokeTestEnabled: boolean): boolean {
  if (value === null) return true;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return false;
    if (url.hostname === "fixture.invalid") return true;
    return realSiteSmokeTestEnabled && REAL_SITE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
