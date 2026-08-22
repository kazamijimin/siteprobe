import { sql, type SQL } from "drizzle-orm";
import {
  ACCESSIBILITY_EVALUATOR_VERSION,
  AXE_ENGINE_VERSION,
  QA_EVALUATOR_VERSION,
  SEO_EVALUATOR_VERSION,
  accessibilitySummarySchema,
  controlledEvaluationProvenanceSchema,
  evaluationReportListItemSchema,
  qaEvaluationSummarySchema,
  seoEvaluationSummarySchema,
  type EvaluationReportListItem,
} from "@siteprobe/contracts";
import type { SiteProbeDatabase } from "../db/client.js";
import { accessibilityEvaluations, qaEvaluations, seoEvaluations } from "../db/schema.js";
import type {
  EvaluationReportHistoryCursor,
  EvaluationReportHistoryListOptions,
  EvaluationReportHistoryPage,
  EvaluationReportHistoryRepository,
} from "./history.js";

type RawHistoryRow = {
  anchorEvaluationId: string;
  provenance: string;
  requestedUrl: string;
  finalUrl: string | null;
  scannedAt: Date | string;
  createdAt: Date | string;
  qaSummary: unknown;
  accessibilitySummary: unknown;
  seoSummary: unknown;
};

function provenanceExpression(column: SQL): SQL {
  return sql`coalesce(${column}->>'provenance', 'legacy-unknown')`;
}

function evaluationSummaryExpression(column: SQL): SQL {
  return sql`case when ${column} ? 'evaluation' then ${column}->'evaluation'->'summary' else ${column}->'summary' end`;
}

function candidateQuery(table: typeof qaEvaluations | typeof accessibilityEvaluations | typeof seoEvaluations, priority: number, where: SQL, provenance: SQL): SQL {
  return sql`
    select
      ${table.scannerRunId} as "scannerRunId",
      ${table.id} as "evaluationId",
      ${provenance} as "provenance",
      ${table.requestedUrl} as "requestedUrl",
      ${table.finalUrl} as "finalUrl",
      ${table.scannedAt} as "scannedAt",
      ${table.createdAt} as "createdAt",
      ${priority} as "priority"
    from ${table}
    where ${where}
  `;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function unavailable(reason: "not-produced" | "public-access-disabled") {
  return { available: false as const, reason };
}

export class PostgresEvaluationReportHistoryRepository implements EvaluationReportHistoryRepository {
  constructor(
    private readonly db: SiteProbeDatabase,
    private readonly gates: {
      qaPublicReadEnabled: boolean;
      accessibilityPublicReadEnabled: boolean;
      seoPublicReadEnabled: boolean;
    },
  ) {}

  async list(options: EvaluationReportHistoryListOptions): Promise<EvaluationReportHistoryPage> {
    const candidates: SQL[] = [];
    const sourceFilter = options.provenance;
    if (this.gates.qaPublicReadEnabled) {
      const provenance = provenanceExpression(sql.raw('qa_evaluations.evaluation_json'));
      candidates.push(candidateQuery(qaEvaluations, 0, sql`${qaEvaluations.evaluatorVersion} = ${QA_EVALUATOR_VERSION}${sourceFilter ? sql` and ${provenance} = ${sourceFilter}` : sql``}`, provenance));
    }
    if (this.gates.accessibilityPublicReadEnabled) {
      const provenance = provenanceExpression(sql.raw('accessibility_evaluations.evaluation_json'));
      candidates.push(candidateQuery(accessibilityEvaluations, 1, sql`${accessibilityEvaluations.evaluatorVersion} = ${ACCESSIBILITY_EVALUATOR_VERSION} and ${accessibilityEvaluations.engineVersion} = ${AXE_ENGINE_VERSION}${sourceFilter ? sql` and ${provenance} = ${sourceFilter}` : sql``}`, provenance));
    }
    if (this.gates.seoPublicReadEnabled) {
      const provenance = provenanceExpression(sql.raw('seo_evaluations.evaluation_json'));
      candidates.push(candidateQuery(seoEvaluations, 2, sql`${seoEvaluations.evaluatorVersion} = ${SEO_EVALUATOR_VERSION}${sourceFilter ? sql` and ${provenance} = ${sourceFilter}` : sql``}`, provenance));
    }
    if (candidates.length === 0) return { reports: [], nextPosition: null };

    const union = sql.join(candidates, sql` union all `);
    const before = options.before
      ? sql`where (a."createdAt", a."evaluationId") < (${new Date(options.before.createdAt)}, ${options.before.id})`
      : sql``;
    const qaJoin = this.gates.qaPublicReadEnabled ? sql`
      left join qa_evaluations qa on qa.scanner_run_id = a."scannerRunId"
        and qa.evaluator_version = ${QA_EVALUATOR_VERSION}
        and coalesce(qa.evaluation_json->>'provenance', 'legacy-unknown') = a.provenance
        and qa.requested_url = a."requestedUrl"
        and qa.final_url is not distinct from a."finalUrl"
        and qa.scanned_at = a."scannedAt"
    ` : sql``;
    const accessibilityJoin = this.gates.accessibilityPublicReadEnabled ? sql`
      left join accessibility_evaluations accessibility on accessibility.scanner_run_id = a."scannerRunId"
        and accessibility.evaluator_version = ${ACCESSIBILITY_EVALUATOR_VERSION}
        and accessibility.engine_version = ${AXE_ENGINE_VERSION}
        and coalesce(accessibility.evaluation_json->>'provenance', 'legacy-unknown') = a.provenance
        and accessibility.requested_url = a."requestedUrl"
        and accessibility.final_url is not distinct from a."finalUrl"
        and accessibility.scanned_at = a."scannedAt"
    ` : sql``;
    const seoJoin = this.gates.seoPublicReadEnabled ? sql`
      left join seo_evaluations seo on seo.scanner_run_id = a."scannerRunId"
        and seo.evaluator_version = ${SEO_EVALUATOR_VERSION}
        and coalesce(seo.evaluation_json->>'provenance', 'legacy-unknown') = a.provenance
        and seo.requested_url = a."requestedUrl"
        and seo.final_url is not distinct from a."finalUrl"
        and seo.scanned_at = a."scannedAt"
    ` : sql``;
    const qaSummary = this.gates.qaPublicReadEnabled
      ? sql`${evaluationSummaryExpression(sql.raw('qa.evaluation_json'))} as "qaSummary"`
      : sql`null::jsonb as "qaSummary"`;
    const accessibilitySummary = this.gates.accessibilityPublicReadEnabled
      ? sql`${evaluationSummaryExpression(sql.raw('accessibility.evaluation_json'))} as "accessibilitySummary"`
      : sql`null::jsonb as "accessibilitySummary"`;
    const seoSummary = this.gates.seoPublicReadEnabled
      ? sql`${evaluationSummaryExpression(sql.raw('seo.evaluation_json'))} as "seoSummary"`
      : sql`null::jsonb as "seoSummary"`;

    const query = sql`
      with candidates as (${union}), anchors as (
        select distinct on ("scannerRunId") *
        from candidates
        order by "scannerRunId", priority asc, "createdAt" desc, "evaluationId" desc
      )
      select
        a."evaluationId" as "anchorEvaluationId",
        a.provenance,
        a."requestedUrl",
        a."finalUrl",
        a."scannedAt",
        a."createdAt",
        ${qaSummary},
        ${accessibilitySummary},
        ${seoSummary}
      from anchors a
      ${qaJoin}
      ${accessibilityJoin}
      ${seoJoin}
      ${before}
      order by a."createdAt" desc, a."evaluationId" desc
      limit ${options.limit + 1}
    `;
    const result = await this.db.execute(query);
    const resultShape = result as unknown as { rows?: RawHistoryRow[] } | RawHistoryRow[];
    const rows = Array.isArray(resultShape) ? resultShape : resultShape.rows ?? [];
    const reports = rows.map((row) => this.toPublicItem(row));
    const visible = reports.slice(0, options.limit);
    const last = visible.at(-1);
    return {
      reports: visible,
      nextPosition: rows.length > options.limit && last ? { createdAt: last.createdAt, id: last.anchorEvaluationId } : null,
    };
  }

  private toPublicItem(row: RawHistoryRow): EvaluationReportListItem {
    const qa = this.gates.qaPublicReadEnabled
      ? row.qaSummary === null ? unavailable("not-produced") : { available: true as const, summary: qaEvaluationSummarySchema.parse(row.qaSummary) }
      : unavailable("public-access-disabled");
    const accessibility = this.gates.accessibilityPublicReadEnabled
      ? row.accessibilitySummary === null ? unavailable("not-produced") : { available: true as const, summary: accessibilitySummarySchema.parse(row.accessibilitySummary) }
      : unavailable("public-access-disabled");
    const seo = this.gates.seoPublicReadEnabled
      ? row.seoSummary === null ? unavailable("not-produced") : { available: true as const, summary: seoEvaluationSummarySchema.parse(row.seoSummary) }
      : unavailable("public-access-disabled");
    return evaluationReportListItemSchema.parse({
      schemaVersion: 1,
      anchorEvaluationId: row.anchorEvaluationId,
      provenance: controlledEvaluationProvenanceSchema.parse(row.provenance),
      requestedUrl: row.requestedUrl,
      finalUrl: row.finalUrl,
      scannedAt: iso(row.scannedAt),
      createdAt: iso(row.createdAt),
      qa,
      accessibility,
      seo,
    });
  }
}
