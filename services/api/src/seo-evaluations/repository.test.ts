import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemorySeoEvaluationRepository, SeoEvaluationConflictError } from "./repository.js";
import type { SeoEvaluationCreate } from "@siteprobe/contracts";

function input(scannerRunId = randomUUID()): SeoEvaluationCreate { return { schemaVersion: 1, evaluatorVersion: 1, scannerRunId, requestedUrl: "http://fixture.invalid/seo-clean", finalUrl: "http://fixture.invalid/seo-clean", scannedAt: "2026-08-21T00:00:00.000Z", evaluation: { status: "completed", summary: { passed: 9, warnings: 0, notApplicable: 0 }, findings: [
  { ruleId: "SEO_TITLE_PRESENT", status: "passed", severity: "info", description: "ok", evidence: { kind: "title", present: true, value: "title", characterCount: 5, truncated: false } },
  { ruleId: "SEO_TITLE_LENGTH", status: "passed", severity: "info", description: "ok", evidence: { kind: "title", present: true, value: "title", characterCount: 5, truncated: false } },
  { ruleId: "SEO_META_DESCRIPTION_PRESENT", status: "passed", severity: "info", description: "ok", evidence: { kind: "description", present: true, value: "description", characterCount: 11, truncated: false } },
  { ruleId: "SEO_META_DESCRIPTION_LENGTH", status: "passed", severity: "info", description: "ok", evidence: { kind: "description", present: true, value: "description", characterCount: 11, truncated: false } },
  { ruleId: "SEO_CANONICAL_PRESENT", status: "passed", severity: "info", description: "ok", evidence: { kind: "canonical", present: true, value: "http://fixture.invalid/seo-clean", truncated: false } },
  { ruleId: "SEO_HTML_LANG_PRESENT", status: "passed", severity: "info", description: "ok", evidence: { kind: "htmlLang", present: true, value: "en", truncated: false } },
  { ruleId: "SEO_VIEWPORT_PRESENT", status: "passed", severity: "info", description: "ok", evidence: { kind: "viewport", present: true, value: "width=device-width", truncated: false } },
  { ruleId: "SEO_SINGLE_H1", status: "passed", severity: "info", description: "ok", evidence: { kind: "headings", h1Count: 1, headingCounts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
  { ruleId: "SEO_IMAGES_HAVE_ALT", status: "passed", severity: "info", description: "ok", evidence: { kind: "images", imageCount: 0, missingAltCount: 0, samples: [], samplesTruncated: false } },
 ] } }; }
describe("in-memory SEO persistence", () => { it("is idempotent and conflicts on a changed payload", () => { const repository = new InMemorySeoEvaluationRepository(); const value = input(); const first = repository.create(value); expect(first.created).toBe(true); expect(repository.create(value)).toMatchObject({ created: false, evaluation: { id: first.evaluation.id } }); expect(() => repository.create({ ...value, finalUrl: null })).toThrow(SeoEvaluationConflictError); }); });
