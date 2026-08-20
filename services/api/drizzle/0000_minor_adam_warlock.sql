CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requested_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"status" text NOT NULL,
	"overall_score" smallint,
	"critical_count" integer NOT NULL,
	"warning_count" integer NOT NULL,
	"passed_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "scans_status_check" CHECK ("scans"."status" in ('queued', 'running', 'completed', 'failed')),
	CONSTRAINT "scans_score_check" CHECK ("scans"."overall_score" is null or ("scans"."overall_score" >= 0 and "scans"."overall_score" <= 100)),
	CONSTRAINT "scans_critical_count_check" CHECK ("scans"."critical_count" >= 0),
	CONSTRAINT "scans_warning_count_check" CHECK ("scans"."warning_count" >= 0),
	CONSTRAINT "scans_passed_count_check" CHECK ("scans"."passed_count" >= 0)
);
