import {
  controlledEvaluationProvenanceSchema,
  type ControlledEvaluationProvenance,
} from "@siteprobe/contracts";

const CONTROLLED_FIXTURE_HOST = "fixture.invalid";
const REAL_SITE_HOSTS = new Set(["readirect.org", "www.readirect.org"]);

export function inferLegacyControlledProvenance(requestedUrl: string): ControlledEvaluationProvenance {
  try {
    const hostname = new URL(requestedUrl).hostname.toLowerCase();
    if (hostname === CONTROLLED_FIXTURE_HOST) return "controlled-fixture";
    if (REAL_SITE_HOSTS.has(hostname)) return "real-site-smoke-test";
  } catch {
    // Preserve malformed historical rows as explicitly unknown.
  }
  return "legacy-unknown";
}

export function resolveControlledProvenance(
  provenance: ControlledEvaluationProvenance | undefined,
  requestedUrl: string,
): ControlledEvaluationProvenance {
  return provenance ?? inferLegacyControlledProvenance(requestedUrl);
}

export function storedEvaluation<T>(evaluation: T, provenance: ControlledEvaluationProvenance): { evaluation: T; provenance: ControlledEvaluationProvenance } {
  return { evaluation, provenance };
}

export function readStoredEvaluation<T>(raw: unknown, requestedUrl: string): { evaluation: T; provenance: ControlledEvaluationProvenance } {
  if (typeof raw === "object" && raw !== null && "evaluation" in raw) {
    const candidate = raw as { evaluation?: unknown; provenance?: unknown };
    const parsed = controlledEvaluationProvenanceSchema.safeParse(candidate.provenance);
    return {
      evaluation: candidate.evaluation as T,
      provenance: parsed.success ? parsed.data : inferLegacyControlledProvenance(requestedUrl),
    };
  }
  return { evaluation: raw as T, provenance: inferLegacyControlledProvenance(requestedUrl) };
}

export function isControlledProvenanceTargetAllowed(
  provenance: ControlledEvaluationProvenance,
  requestedUrl: string,
  finalUrl: string | null,
  realSiteSmokeTestEnabled: boolean,
): boolean {
  if (provenance === "legacy-unknown") return false;
  const urls = [requestedUrl, ...(finalUrl ? [finalUrl] : [])];
  return urls.every((value) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (parsed.username || parsed.password) return false;
      if (provenance === "controlled-fixture") return parsed.hostname.toLowerCase() === CONTROLLED_FIXTURE_HOST;
      return realSiteSmokeTestEnabled && REAL_SITE_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  });
}
