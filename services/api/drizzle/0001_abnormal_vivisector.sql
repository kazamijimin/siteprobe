CREATE TABLE "qa_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scanner_run_id" uuid NOT NULL,
	"source" text DEFAULT 'controlled-scanner' NOT NULL,
	"schema_version" smallint NOT NULL,
	"evaluator_version" smallint NOT NULL,
	"requested_url" text NOT NULL,
	"final_url" text,
	"scanned_at" timestamp with time zone NOT NULL,
	"evaluation_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_evaluations_scanner_run_evaluator_unique" UNIQUE("scanner_run_id","evaluator_version"),
	CONSTRAINT "qa_evaluations_source_check" CHECK ("qa_evaluations"."source" = 'controlled-scanner'),
	CONSTRAINT "qa_evaluations_schema_version_check" CHECK ("qa_evaluations"."schema_version" > 0),
	CONSTRAINT "qa_evaluations_evaluator_version_check" CHECK ("qa_evaluations"."evaluator_version" > 0),
	CONSTRAINT "qa_evaluations_requested_url_length_check" CHECK (char_length("qa_evaluations"."requested_url") <= 2048),
	CONSTRAINT "qa_evaluations_final_url_length_check" CHECK ("qa_evaluations"."final_url" is null or char_length("qa_evaluations"."final_url") <= 2048)
);
