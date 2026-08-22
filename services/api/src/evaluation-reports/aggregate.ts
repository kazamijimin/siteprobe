import {
  ACCESSIBILITY_EVALUATOR_VERSION,
  AXE_ENGINE_VERSION,
  QA_EVALUATOR_VERSION,
  SEO_EVALUATOR_VERSION,
  type ControlledQaEvaluationResponse,
  type AccessibilityEvaluationResponse,
  type SeoEvaluationResponse,
  type EvaluationReportAttentionItem,
  type EvaluationReportPublicResponse,
} from "@siteprobe/contracts";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";

type EvaluationReportOptions = {
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
  seoRepository: SeoEvaluationRepository;
  seoPublicReadEnabled: boolean;
};

type Anchor =
  | { kind: "qa"; evaluation: ControlledQaEvaluationResponse }
  | { kind: "accessibility"; evaluation: AccessibilityEvaluationResponse }
  | { kind: "seo"; evaluation: SeoEvaluationResponse };

function unavailable(reason: "not-produced" | "public-access-disabled") {
  return { available: false as const, reason };
}

function isCorrelated(anchor: Anchor["evaluation"], candidate: Anchor["evaluation"]): boolean {
  return anchor.scannerRunId === candidate.scannerRunId
    && anchor.provenance === candidate.provenance
    && anchor.requestedUrl === candidate.requestedUrl
    && anchor.finalUrl === candidate.finalUrl
    && anchor.scannedAt === candidate.scannedAt;
}

function seoRuleTitle(ruleId: string): string {
  const titles: Record<string, string> = {
    SEO_TITLE_PRESENT: "Title present",
    SEO_TITLE_LENGTH: "Title length",
    SEO_META_DESCRIPTION_PRESENT: "Meta description present",
    SEO_META_DESCRIPTION_LENGTH: "Meta description length",
    SEO_CANONICAL_PRESENT: "Canonical URL present",
    SEO_HTML_LANG_PRESENT: "HTML language present",
    SEO_VIEWPORT_PRESENT: "Viewport metadata present",
    SEO_SINGLE_H1: "Single H1 heading",
    SEO_IMAGES_HAVE_ALT: "Images have alt text",
  };
  return titles[ruleId] ?? ruleId;
}

function seoRemediation(ruleId: string): string | undefined {
  const remediation: Record<string, string> = {
    SEO_TITLE_PRESENT: "Add a descriptive <title> element to the document head.",
    SEO_TITLE_LENGTH: "Review the title so it is concise and descriptive for search results.",
    SEO_META_DESCRIPTION_PRESENT: "Add a descriptive <meta name=\"description\"> element.",
    SEO_META_DESCRIPTION_LENGTH: "Rewrite the meta description to communicate the page clearly within a useful length.",
    SEO_CANONICAL_PRESENT: "Add a canonical link that identifies the preferred page URL.",
    SEO_HTML_LANG_PRESENT: "Set the document html lang attribute to the primary page language.",
    SEO_VIEWPORT_PRESENT: "Add responsive viewport metadata for mobile rendering.",
    SEO_SINGLE_H1: "Review heading hierarchy and keep the primary page heading clear.",
    SEO_IMAGES_HAVE_ALT: "Add meaningful alternative text for informative images.",
  };
  return remediation[ruleId];
}

function attentionItems(anchor: Anchor["evaluation"], qa: ControlledQaEvaluationResponse | undefined, accessibility: AccessibilityEvaluationResponse | undefined, seo: SeoEvaluationResponse | undefined): EvaluationReportAttentionItem[] {
  const items: EvaluationReportAttentionItem[] = [];
  if (qa && isCorrelated(anchor, qa)) {
    for (const finding of qa.evaluation.findings) {
      if (finding.status !== "failed" || (finding.severity !== "critical" && finding.severity !== "warning")) continue;
      if (finding.ruleId === "NO_FAILED_REQUESTS" && finding.evidence.kind === "failedRequests" && finding.evidence.targetFailureCount === 0) continue;
      items.push({ source: "qa", severity: finding.severity, ruleId: finding.ruleId, title: finding.title, description: finding.description });
    }
  }
  if (accessibility && isCorrelated(anchor, accessibility)) {
    if (accessibility.evaluation.status === "completed") {
      for (const finding of accessibility.evaluation.violations) {
        items.push({ source: "accessibility", severity: finding.impact ?? "warning", ruleId: finding.ruleId, title: finding.help, description: `${finding.affectedNodeCount} affected node${finding.affectedNodeCount === 1 ? "" : "s"}.`, impact: finding.impact, affectedNodeCount: finding.affectedNodeCount });
      }
      for (const finding of accessibility.evaluation.needsReview) {
        items.push({ source: "accessibility", severity: "needsReview", ruleId: finding.ruleId, title: finding.help, description: `${finding.affectedNodeCount} node${finding.affectedNodeCount === 1 ? "" : "s"} need manual review; this is not a confirmed WCAG failure.`, impact: finding.impact, affectedNodeCount: finding.affectedNodeCount });
      }
    }
  }
  if (seo && isCorrelated(anchor, seo) && seo.evaluation.status === "completed") {
    for (const finding of seo.evaluation.findings) {
      if (finding.status !== "failed") continue;
      items.push({ source: "seo", severity: "warning", ruleId: finding.ruleId, title: seoRuleTitle(finding.ruleId), description: finding.description, remediation: seoRemediation(finding.ruleId) });
    }
  }
  return items.slice(0, 20);
}

async function resolveAnchor(id: string, options: EvaluationReportOptions): Promise<Anchor | undefined> {
  if (options.qaPublicReadEnabled) {
    const evaluation = await options.qaRepository.findById(id);
    if (evaluation) return { kind: "qa", evaluation };
  }
  if (options.accessibilityPublicReadEnabled) {
    const evaluation = await options.accessibilityRepository.findById(id);
    if (evaluation) return { kind: "accessibility", evaluation };
  }
  if (options.seoPublicReadEnabled) {
    const evaluation = await options.seoRepository.findById(id);
    if (evaluation) return { kind: "seo", evaluation };
  }
  return undefined;
}

export async function resolveEvaluationReport(anchorEvaluationId: string, options: EvaluationReportOptions): Promise<EvaluationReportPublicResponse | undefined> {
  const anchor = await resolveAnchor(anchorEvaluationId, options);
  if (!anchor) return undefined;
  const base = anchor.evaluation;

  const qa = options.qaPublicReadEnabled
    ? await options.qaRepository.findByScannerRun(base.scannerRunId, QA_EVALUATOR_VERSION)
    : undefined;
  const accessibility = options.accessibilityPublicReadEnabled
    ? await options.accessibilityRepository.findByScannerRun(base.scannerRunId, ACCESSIBILITY_EVALUATOR_VERSION, AXE_ENGINE_VERSION)
    : undefined;
  const seo = options.seoPublicReadEnabled
    ? await options.seoRepository.findByScannerRun(base.scannerRunId, SEO_EVALUATOR_VERSION)
    : undefined;

  const correlatedQa = qa && isCorrelated(base, qa) ? qa : undefined;
  const correlatedAccessibility = accessibility && isCorrelated(base, accessibility) ? accessibility : undefined;
  const correlatedSeo = seo && isCorrelated(base, seo) ? seo : undefined;

  return {
    schemaVersion: 1,
    anchorEvaluationId: base.id,
    provenance: base.provenance,
    requestedUrl: base.requestedUrl,
    finalUrl: base.finalUrl,
    scannedAt: base.scannedAt,
    qa: options.qaPublicReadEnabled
      ? correlatedQa
        ? { available: true, evaluationId: correlatedQa.id, summary: correlatedQa.evaluation.summary }
        : unavailable("not-produced")
      : unavailable("public-access-disabled"),
    accessibility: options.accessibilityPublicReadEnabled
      ? correlatedAccessibility
        ? { available: true, evaluationId: correlatedAccessibility.id, summary: correlatedAccessibility.evaluation.summary }
        : unavailable("not-produced")
      : unavailable("public-access-disabled"),
    seo: options.seoPublicReadEnabled
      ? correlatedSeo
        ? { available: true, evaluationId: correlatedSeo.id, summary: correlatedSeo.evaluation.summary }
        : unavailable("not-produced")
      : unavailable("public-access-disabled"),
    attentionItems: attentionItems(base, correlatedQa, correlatedAccessibility, correlatedSeo),
  };
}

export type { EvaluationReportOptions };
