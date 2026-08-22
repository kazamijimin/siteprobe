import type {
  AccessibilityEvaluationResponse,
  ControlledEvaluationProvenance,
  ControlledQaEvaluationResponse,
  EvaluationReportListItem,
  EvaluationReportListQa,
  EvaluationReportListAccessibility,
  EvaluationReportListSeo,
  SeoEvaluationResponse,
} from "@siteprobe/contracts";
import type { AccessibilityEvaluationRepository } from "../accessibility-evaluations/repository.js";
import type { QaEvaluationRepository } from "../evaluations/repository.js";
import type { SeoEvaluationRepository } from "../seo-evaluations/repository.js";

export type EvaluationReportHistoryCursor = {
  createdAt: string;
  id: string;
};

export type EvaluationReportHistoryListOptions = {
  limit: number;
  before?: EvaluationReportHistoryCursor;
  provenance?: ControlledEvaluationProvenance;
};

export type EvaluationReportHistoryPage = {
  reports: EvaluationReportListItem[];
  nextPosition: EvaluationReportHistoryCursor | null;
};

export interface EvaluationReportHistoryRepository {
  list(options: EvaluationReportHistoryListOptions): Promise<EvaluationReportHistoryPage> | EvaluationReportHistoryPage;
}

type HistoryOptions = {
  qaRepository: QaEvaluationRepository;
  qaPublicReadEnabled: boolean;
  accessibilityRepository: AccessibilityEvaluationRepository;
  accessibilityPublicReadEnabled: boolean;
  seoRepository: SeoEvaluationRepository;
  seoPublicReadEnabled: boolean;
};

type Candidate =
  | { kind: "qa"; evaluation: ControlledQaEvaluationResponse }
  | { kind: "accessibility"; evaluation: AccessibilityEvaluationResponse }
  | { kind: "seo"; evaluation: SeoEvaluationResponse };

type EvaluationMetadata = {
  scannerRunId: string;
  provenance: ControlledEvaluationProvenance;
  requestedUrl: string;
  finalUrl: string | null;
  scannedAt: string;
};

function isCorrelated(anchor: EvaluationMetadata, candidate: EvaluationMetadata): boolean {
  return anchor.scannerRunId === candidate.scannerRunId
    && anchor.provenance === candidate.provenance
    && anchor.requestedUrl === candidate.requestedUrl
    && anchor.finalUrl === candidate.finalUrl
    && anchor.scannedAt === candidate.scannedAt;
}

function unavailable(reason: "not-produced" | "public-access-disabled") {
  return { available: false as const, reason };
}

function chooseAnchor(candidates: Candidate[], options: HistoryOptions): Candidate | undefined {
  const priority: Candidate["kind"][] = [];
  if (options.qaPublicReadEnabled) priority.push("qa");
  if (options.accessibilityPublicReadEnabled) priority.push("accessibility");
  if (options.seoPublicReadEnabled) priority.push("seo");
  for (const kind of priority) {
    const candidate = candidates.find((item) => item.kind === kind);
    if (candidate) return candidate;
  }
  return undefined;
}

function qaSummary(anchor: Candidate, candidates: Candidate[], enabled: boolean): EvaluationReportListQa {
  if (!enabled) return unavailable("public-access-disabled");
  const candidate = candidates.find((item): item is Extract<Candidate, { kind: "qa" }> => item.kind === "qa" && isCorrelated(anchor.evaluation, item.evaluation));
  return candidate ? { available: true, summary: candidate.evaluation.evaluation.summary } : unavailable("not-produced");
}

function accessibilitySummary(anchor: Candidate, candidates: Candidate[], enabled: boolean): EvaluationReportListAccessibility {
  if (!enabled) return unavailable("public-access-disabled");
  const candidate = candidates.find((item): item is Extract<Candidate, { kind: "accessibility" }> => item.kind === "accessibility" && isCorrelated(anchor.evaluation, item.evaluation));
  return candidate ? { available: true, summary: candidate.evaluation.evaluation.summary } : unavailable("not-produced");
}

function seoSummary(anchor: Candidate, candidates: Candidate[], enabled: boolean): EvaluationReportListSeo {
  if (!enabled) return unavailable("public-access-disabled");
  const candidate = candidates.find((item): item is Extract<Candidate, { kind: "seo" }> => item.kind === "seo" && isCorrelated(anchor.evaluation, item.evaluation));
  return candidate ? { available: true, summary: candidate.evaluation.evaluation.summary } : unavailable("not-produced");
}

function compareDescending(left: EvaluationReportListItem, right: EvaluationReportListItem): number {
  const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDifference !== 0) return createdDifference;
  if (left.anchorEvaluationId === right.anchorEvaluationId) return 0;
  return left.anchorEvaluationId > right.anchorEvaluationId ? -1 : 1;
}

function isBeforeCursor(item: EvaluationReportListItem, cursor: EvaluationReportHistoryCursor): boolean {
  const itemCreatedAt = Date.parse(item.createdAt);
  const cursorCreatedAt = Date.parse(cursor.createdAt);
  return itemCreatedAt < cursorCreatedAt
    || (itemCreatedAt === cursorCreatedAt && item.anchorEvaluationId < cursor.id);
}

export class InMemoryEvaluationReportHistoryRepository implements EvaluationReportHistoryRepository {
  constructor(private readonly options: HistoryOptions) {}

  async list(options: EvaluationReportHistoryListOptions): Promise<EvaluationReportHistoryPage> {
    const candidates: Candidate[] = [];
    const fetchLimit = 10_000;
    if (this.options.qaPublicReadEnabled) {
      const page = await this.options.qaRepository.list({ limit: fetchLimit });
      candidates.push(...page.evaluations.map((evaluation) => ({ kind: "qa" as const, evaluation })));
    }
    if (this.options.accessibilityPublicReadEnabled) {
      const page = await this.options.accessibilityRepository.list({ limit: fetchLimit });
      candidates.push(...page.evaluations.map((evaluation) => ({ kind: "accessibility" as const, evaluation })));
    }
    if (this.options.seoPublicReadEnabled) {
      const page = await this.options.seoRepository.list({ limit: fetchLimit });
      candidates.push(...page.evaluations.map((evaluation) => ({ kind: "seo" as const, evaluation })));
    }

    const runs = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      if (options.provenance && candidate.evaluation.provenance !== options.provenance) continue;
      const run = runs.get(candidate.evaluation.scannerRunId) ?? [];
      run.push(candidate);
      runs.set(candidate.evaluation.scannerRunId, run);
    }

    const reports: EvaluationReportListItem[] = [];
    for (const run of runs.values()) {
      const anchor = chooseAnchor(run, this.options);
      if (!anchor) continue;
      const base = anchor.evaluation;
      reports.push({
        schemaVersion: 1,
        anchorEvaluationId: base.id,
        provenance: base.provenance,
        requestedUrl: base.requestedUrl,
        finalUrl: base.finalUrl,
        scannedAt: base.scannedAt,
        createdAt: base.createdAt,
        qa: qaSummary(anchor, run, this.options.qaPublicReadEnabled),
        accessibility: accessibilitySummary(anchor, run, this.options.accessibilityPublicReadEnabled),
        seo: seoSummary(anchor, run, this.options.seoPublicReadEnabled),
      });
    }

    const page = reports
      .filter((report) => !options.before || isBeforeCursor(report, options.before))
      .sort(compareDescending)
      .slice(0, options.limit + 1);
    const hasMore = page.length > options.limit;
    const visible = page.slice(0, options.limit);
    const last = visible.at(-1);
    return {
      reports: visible,
      nextPosition: hasMore && last ? { createdAt: last.createdAt, id: last.anchorEvaluationId } : null,
    };
  }
}

export type { HistoryOptions };
