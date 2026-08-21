import { z } from "zod";

export const controlledFixtureIdSchema = z.enum([
  "healthy",
  "missing-title",
  "status-404",
  "redirect-ok",
  "navigation-timeout",
  "console-error",
  "failed-resource",
]);

export type ControlledFixtureId = z.infer<typeof controlledFixtureIdSchema>;

export type ControlledFixtureDefinition = Readonly<{
  path: string;
  limits?: Readonly<{
    navigationTimeoutMs: number;
    jobTimeoutMs: number;
  }>;
}>;

const controlledFixtureCatalog: Record<ControlledFixtureId, ControlledFixtureDefinition> = {
  healthy: { path: "/" },
  "missing-title": { path: "/missing-title" },
  "status-404": { path: "/status-404" },
  "redirect-ok": { path: "/redirect-ok" },
  "navigation-timeout": {
    path: "/slow",
    limits: { navigationTimeoutMs: 100, jobTimeoutMs: 1_500 },
  },
  "console-error": { path: "/console-error" },
  "failed-resource": { path: "/failed-resource" },
};

export function getControlledFixtureDefinition(input: unknown): ControlledFixtureDefinition {
  const fixtureId = controlledFixtureIdSchema.parse(input);
  return controlledFixtureCatalog[fixtureId];
}

export function listControlledFixtureIds(): readonly ControlledFixtureId[] {
  return controlledFixtureIdSchema.options;
}
