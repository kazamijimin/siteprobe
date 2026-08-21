import { z } from "zod";

export const seoFixtureIdSchema = z.enum([
  "seo-clean",
  "seo-missing-metadata",
  "seo-title-length",
  "seo-multiple-h1",
  "seo-missing-alt",
  "seo-navigation-timeout",
]);
export type SeoFixtureId = z.infer<typeof seoFixtureIdSchema>;
export type SeoFixtureDefinition = Readonly<{ path: string; limits?: Readonly<{ navigationTimeoutMs: number; jobTimeoutMs: number }> }>;
const catalog: Record<SeoFixtureId, SeoFixtureDefinition> = {
  "seo-clean": { path: "/seo-clean" },
  "seo-missing-metadata": { path: "/seo-missing-metadata" },
  "seo-title-length": { path: "/seo-title-length" },
  "seo-multiple-h1": { path: "/seo-multiple-h1" },
  "seo-missing-alt": { path: "/seo-missing-alt" },
  "seo-navigation-timeout": { path: "/slow", limits: { navigationTimeoutMs: 100, jobTimeoutMs: 1_500 } },
};
export function getSeoFixtureDefinition(input: unknown): SeoFixtureDefinition { return catalog[seoFixtureIdSchema.parse(input)]; }
export function listSeoFixtureIds(): readonly SeoFixtureId[] { return seoFixtureIdSchema.options; }
