import { z } from "zod";

/** Public result origin. Legacy rows are retained without guessing. */
export const evaluationProvenanceSchema = z.enum([
  "synthetic",
  "controlled-fixture",
  "real-site-smoke-test",
  "legacy-unknown",
]);

export const controlledEvaluationProvenanceSchema = z.enum([
  "controlled-fixture",
  "real-site-smoke-test",
  "legacy-unknown",
]);

export type EvaluationProvenance = z.infer<typeof evaluationProvenanceSchema>;
export type ControlledEvaluationProvenance = z.infer<typeof controlledEvaluationProvenanceSchema>;
