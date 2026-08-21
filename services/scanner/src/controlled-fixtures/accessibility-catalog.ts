import { z } from "zod";

export const accessibilityFixtureIdSchema = z.enum([
  "accessibility-clean",
  "accessibility-missing-alt",
  "accessibility-mixed",
  "accessibility-navigation-timeout",
]);

export type AccessibilityFixtureId = z.infer<typeof accessibilityFixtureIdSchema>;

export type AccessibilityFixtureDefinition = Readonly<{
  path: string;
  limits?: Readonly<{ navigationTimeoutMs: number; jobTimeoutMs: number }>;
}>;

const accessibilityFixtureCatalog: Record<AccessibilityFixtureId, AccessibilityFixtureDefinition> = {
  "accessibility-clean": { path: "/accessibility-clean" },
  "accessibility-missing-alt": { path: "/accessibility-missing-alt" },
  "accessibility-mixed": { path: "/accessibility-mixed" },
  "accessibility-navigation-timeout": {
    path: "/slow",
    limits: { navigationTimeoutMs: 100, jobTimeoutMs: 1_500 },
  },
};

export function getAccessibilityFixtureDefinition(input: unknown): AccessibilityFixtureDefinition {
  const fixtureId = accessibilityFixtureIdSchema.parse(input);
  return accessibilityFixtureCatalog[fixtureId];
}

export function listAccessibilityFixtureIds(): readonly AccessibilityFixtureId[] {
  return accessibilityFixtureIdSchema.options;
}
