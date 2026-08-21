import {
  seoEvaluationSchema,
  type SeoEvaluation,
  type SeoFinding,
} from "@siteprobe/contracts";
import type { ScannerResult } from "@siteprobe/contracts";
import type { SeoDomSnapshot } from "./collect-seo.js";

const titleLength = (value: string) => Array.from(value).length;

function finding(input: Omit<SeoFinding, "severity"> & { severity?: SeoFinding["severity"] }): SeoFinding {
  return { ...input, severity: input.severity ?? (input.status === "failed" ? "warning" : "info") };
}

function notApplicableFindings(): SeoFinding[] {
  const emptyTitle = { kind: "title" as const, present: false, value: null, characterCount: 0, truncated: false };
  const emptyDescription = { kind: "description" as const, present: false, value: null, characterCount: 0, truncated: false };
  const emptyCanonical = { kind: "canonical" as const, present: false, value: null, truncated: false };
  const emptyLang = { kind: "htmlLang" as const, present: false, value: null, truncated: false };
  const emptyViewport = { kind: "viewport" as const, present: false, value: null, truncated: false };
  const emptyHeadings = { kind: "headings" as const, h1Count: 0, headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } };
  const emptyImages = { kind: "images" as const, imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false };
  return [
    finding({ ruleId: "SEO_TITLE_PRESENT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyTitle }),
    finding({ ruleId: "SEO_TITLE_LENGTH", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyTitle }),
    finding({ ruleId: "SEO_META_DESCRIPTION_PRESENT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyDescription }),
    finding({ ruleId: "SEO_META_DESCRIPTION_LENGTH", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyDescription }),
    finding({ ruleId: "SEO_CANONICAL_PRESENT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyCanonical }),
    finding({ ruleId: "SEO_HTML_LANG_PRESENT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyLang }),
    finding({ ruleId: "SEO_VIEWPORT_PRESENT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyViewport }),
    finding({ ruleId: "SEO_SINGLE_H1", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyHeadings }),
    finding({ ruleId: "SEO_IMAGES_HAVE_ALT", status: "notApplicable", description: "SEO inspection was skipped because navigation failed", evidence: emptyImages }),
  ];
}

export function evaluateSeo(scannerResult: ScannerResult, snapshot?: SeoDomSnapshot): SeoEvaluation {
  if (!scannerResult.navigationSucceeded || !snapshot) {
    return seoEvaluationSchema.parse({ status: "notApplicable", reason: "navigationFailed", summary: { passed: 0, warnings: 0, notApplicable: 9 }, findings: notApplicableFindings() });
  }
  const title = { kind: "title" as const, present: snapshot.title.length > 0, value: snapshot.title, characterCount: titleLength(snapshot.title), truncated: snapshot.titleTruncated ?? false };
  const description = snapshot.description === null ? { kind: "description" as const, present: false, value: null, characterCount: 0, truncated: false } : { kind: "description" as const, present: snapshot.description.length > 0, value: snapshot.description, characterCount: titleLength(snapshot.description), truncated: snapshot.descriptionTruncated ?? false };
  const canonical = { kind: "canonical" as const, present: Boolean(snapshot.canonical?.length), value: snapshot.canonical, truncated: snapshot.canonicalTruncated ?? false };
  const htmlLang = { kind: "htmlLang" as const, present: Boolean(snapshot.htmlLang?.length), value: snapshot.htmlLang, truncated: snapshot.htmlLangTruncated ?? false };
  const viewport = { kind: "viewport" as const, present: Boolean(snapshot.viewport?.length), value: snapshot.viewport, truncated: snapshot.viewportTruncated ?? false };
  const headings = { kind: "headings" as const, h1Count: snapshot.headingCounts.h1, headingCounts: snapshot.headingCounts };
  const images = { kind: "images" as const, imageCount: snapshot.imageCount, missingAltCount: snapshot.missingAltCount, samples: snapshot.missingAltSamples.slice(0, 3), samplesTruncated: snapshot.missingAltSamplesTruncated ?? false };
  const findings = [
    finding({ ruleId: "SEO_TITLE_PRESENT", status: title.present ? "passed" : "failed", description: title.present ? "Document title is present" : "Document title is missing", evidence: title }),
    finding({ ruleId: "SEO_TITLE_LENGTH", status: !title.present ? "notApplicable" : title.characterCount >= 30 && title.characterCount <= 60 ? "passed" : "failed", description: !title.present ? "Title length is not applicable when the title is missing" : title.characterCount >= 30 && title.characterCount <= 60 ? "Document title is within the recommended 30-60 character range" : "Document title is outside the recommended 30-60 character range", evidence: title }),
    finding({ ruleId: "SEO_META_DESCRIPTION_PRESENT", status: description.present ? "passed" : "failed", description: description.present ? "Meta description is present" : "Meta description is missing", evidence: description }),
    finding({ ruleId: "SEO_META_DESCRIPTION_LENGTH", status: !description.present ? "notApplicable" : description.characterCount >= 70 && description.characterCount <= 160 ? "passed" : "failed", description: !description.present ? "Meta description length is not applicable when missing" : description.characterCount >= 70 && description.characterCount <= 160 ? "Meta description is within the recommended 70-160 character range" : "Meta description is outside the recommended 70-160 character range", evidence: description }),
    finding({ ruleId: "SEO_CANONICAL_PRESENT", status: canonical.present ? "passed" : "failed", description: canonical.present ? "Canonical link is present" : "Canonical link is missing", evidence: canonical }),
    finding({ ruleId: "SEO_HTML_LANG_PRESENT", status: htmlLang.present ? "passed" : "failed", description: htmlLang.present ? "HTML language is present" : "HTML language is missing", evidence: htmlLang }),
    finding({ ruleId: "SEO_VIEWPORT_PRESENT", status: viewport.present ? "passed" : "failed", description: viewport.present ? "Viewport metadata is present" : "Viewport metadata is missing", evidence: viewport }),
    finding({ ruleId: "SEO_SINGLE_H1", status: headings.h1Count === 1 ? "passed" : "failed", description: headings.h1Count === 1 ? "Document contains exactly one H1" : `Document contains ${headings.h1Count} H1 elements`, evidence: headings }),
    finding({ ruleId: "SEO_IMAGES_HAVE_ALT", status: images.missingAltCount === 0 ? "passed" : "failed", description: images.missingAltCount === 0 ? "All images have non-empty alt text" : `${images.missingAltCount} image(s) have missing or empty alt text`, evidence: images }),
  ];
  const summary = findings.reduce((result, item) => {
    if (item.status === "passed") result.passed += 1;
    if (item.status === "failed") result.warnings += 1;
    if (item.status === "notApplicable") result.notApplicable += 1;
    return result;
  }, { passed: 0, warnings: 0, notApplicable: 0 });
  return seoEvaluationSchema.parse({ status: "completed", summary, findings });
}
