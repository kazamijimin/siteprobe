import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { ControlledQaEvaluationCreate, ScanStatus } from "@siteprobe/contracts";

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey(),
    requestedUrl: text("requested_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    status: text("status").$type<ScanStatus>().notNull(),
    overallScore: smallint("overall_score"),
    criticalCount: integer("critical_count").notNull(),
    warningCount: integer("warning_count").notNull(),
    passedCount: integer("passed_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    statusCheck: check(
      "scans_status_check",
      sql`${table.status} in ('queued', 'running', 'completed', 'failed')`,
    ),
    scoreCheck: check(
      "scans_score_check",
      sql`${table.overallScore} is null or (${table.overallScore} >= 0 and ${table.overallScore} <= 100)`,
    ),
    criticalCountCheck: check(
      "scans_critical_count_check",
      sql`${table.criticalCount} >= 0`,
    ),
    warningCountCheck: check(
      "scans_warning_count_check",
      sql`${table.warningCount} >= 0`,
    ),
    passedCountCheck: check(
      "scans_passed_count_check",
      sql`${table.passedCount} >= 0`,
    ),
  }),
);

export type ScanRow = typeof scans.$inferSelect;
export type NewScanRow = typeof scans.$inferInsert;

export const qaEvaluations = pgTable(
  "qa_evaluations",
  {
    id: uuid("id").primaryKey(),
    scannerRunId: uuid("scanner_run_id").notNull(),
    source: text("source").notNull().default("controlled-scanner"),
    schemaVersion: smallint("schema_version").notNull(),
    evaluatorVersion: smallint("evaluator_version").notNull(),
    requestedUrl: text("requested_url").notNull(),
    finalUrl: text("final_url"),
    scannedAt: timestamp("scanned_at", { withTimezone: true, mode: "date" }).notNull(),
    evaluationJson: jsonb("evaluation_json").$type<ControlledQaEvaluationCreate["evaluation"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    scannerRunVersionUnique: unique("qa_evaluations_scanner_run_evaluator_unique").on(table.scannerRunId, table.evaluatorVersion),
    sourceCheck: check("qa_evaluations_source_check", sql`${table.source} = 'controlled-scanner'`),
    schemaVersionCheck: check("qa_evaluations_schema_version_check", sql`${table.schemaVersion} > 0`),
    evaluatorVersionCheck: check("qa_evaluations_evaluator_version_check", sql`${table.evaluatorVersion} > 0`),
    requestedUrlLengthCheck: check("qa_evaluations_requested_url_length_check", sql`char_length(${table.requestedUrl}) <= 2048`),
    finalUrlLengthCheck: check("qa_evaluations_final_url_length_check", sql`${table.finalUrl} is null or char_length(${table.finalUrl}) <= 2048`),
  }),
);

export type QaEvaluationRow = typeof qaEvaluations.$inferSelect;
export type NewQaEvaluationRow = typeof qaEvaluations.$inferInsert;
