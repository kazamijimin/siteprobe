import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ScanStatus } from "@siteprobe/contracts";

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
