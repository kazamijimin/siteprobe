import type { Page } from "playwright";

export type SeoDomSnapshot = {
  title: string;
  titleTruncated?: boolean;
  description: string | null;
  descriptionTruncated?: boolean;
  canonical: string | null;
  canonicalTruncated?: boolean;
  robots: string | null;
  htmlLang: string | null;
  htmlLangTruncated?: boolean;
  viewport: string | null;
  viewportTruncated?: boolean;
  headingCounts: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  imageCount: number;
  missingAltCount: number;
  missingAltSamples: string[];
  missingAltSamplesTruncated?: boolean;
  internalAnchorCount: number;
  externalAnchorCount: number;
};

const MAX_COUNT = 1_000_000;
const clampCount = (value: number): number => Math.min(MAX_COUNT, Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0));
const normalizeText = (value: string | null | undefined, max: number): { value: string; truncated: boolean } => {
  const normalized = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return { value: normalized.slice(0, max), truncated: normalized.length > max };
};

export async function collectSeo(page: Page): Promise<SeoDomSnapshot> {
  const raw = await page.evaluate(() => {
    const canonical = document.querySelector('link[rel~="canonical"]')?.getAttribute("href") ?? null;
    const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    for (const tag of Object.keys(headingCounts) as Array<keyof typeof headingCounts>) headingCounts[tag] = document.querySelectorAll(tag).length;
    const images = Array.from(document.images);
    const missingAlt: HTMLImageElement[] = [];
    for (const image of images) if ((image.getAttribute("alt") ?? "").trim().length === 0) missingAlt.push(image);
    const base = new URL(document.baseURI);
    const anchors = Array.from(document.links);
    let internal = 0;
    for (const anchor of anchors) {
      try { if (new URL(anchor.href, base).origin === base.origin) internal += 1; } catch { /* ignore malformed links */ }
    }
    const missingAltSamples: string[] = [];
    for (let index = 0; index < missingAlt.length && index < 3; index += 1) {
      const image = missingAlt[index];
      missingAltSamples.push(image.id || image.getAttribute("src") || `img[${index + 1}]`);
    }
    return {
      title: document.title,
      description: document.querySelector('meta[name="description" i]')?.getAttribute("content") ?? null,
      canonical,
      robots: document.querySelector('meta[name="robots" i]')?.getAttribute("content") ?? null,
      htmlLang: document.documentElement.getAttribute("lang"),
      viewport: document.querySelector('meta[name="viewport" i]')?.getAttribute("content") ?? null,
      headingCounts,
      imageCount: images.length,
      missingAltCount: missingAlt.length,
      missingAltSamples,
      missingAltSamplesTruncated: missingAlt.length > 3,
      internalAnchorCount: internal,
      externalAnchorCount: anchors.length - internal,
    };
  }) as SeoDomSnapshot;
  const title = normalizeText(raw.title, 256);
  const description = raw.description === null ? null : normalizeText(raw.description, 512);
  const canonical = raw.canonical === null ? null : normalizeText(raw.canonical, 1024);
  const robots = raw.robots === null ? null : normalizeText(raw.robots, 256);
  const htmlLang = raw.htmlLang === null ? null : normalizeText(raw.htmlLang, 64);
  const viewport = raw.viewport === null ? null : normalizeText(raw.viewport, 256);
  return {
    title: title.value,
    titleTruncated: title.truncated,
    description: description?.value ?? null,
    descriptionTruncated: description?.truncated ?? false,
    canonical: canonical?.value ?? null,
    canonicalTruncated: canonical?.truncated ?? false,
    robots: robots?.value ?? null,
    htmlLang: htmlLang?.value ?? null,
    htmlLangTruncated: htmlLang?.truncated ?? false,
    viewport: viewport?.value ?? null,
    viewportTruncated: viewport?.truncated ?? false,
    headingCounts: {
      h1: clampCount(raw.headingCounts.h1), h2: clampCount(raw.headingCounts.h2), h3: clampCount(raw.headingCounts.h3),
      h4: clampCount(raw.headingCounts.h4), h5: clampCount(raw.headingCounts.h5), h6: clampCount(raw.headingCounts.h6),
    },
    imageCount: clampCount(raw.imageCount),
    missingAltCount: Math.min(clampCount(raw.missingAltCount), clampCount(raw.imageCount)),
    missingAltSamples: raw.missingAltSamples.slice(0, 3).map((sample) => normalizeText(sample, 256).value),
    internalAnchorCount: clampCount(raw.internalAnchorCount),
    externalAnchorCount: clampCount(raw.externalAnchorCount),
  };
}

export { normalizeText };
