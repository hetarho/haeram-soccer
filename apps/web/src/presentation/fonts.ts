import type { FontResource, FontSource } from './contracts';
import { resolveResourceUrl } from './registry';

/** The primary resource remains compatible with packs that declare no alternatives. */
export function getFontSources(font: FontResource): FontSource[] {
  return [{ resource: font.resource, format: font.format }, ...(font.fallbacks ?? [])];
}

export function resolveFontResource(font: FontResource, declaringUrl: string): FontResource {
  const [primary, ...fallbacks] = getFontSources(font).map((source) => ({
    ...source,
    resource: resolveResourceUrl(source.resource, declaringUrl),
  }));
  return { ...font, ...primary, ...(font.fallbacks ? { fallbacks } : {}) };
}

/** Each source is loaded separately; a native multi-source list can stall in WebKit. */
export function fontSourceCss(source: FontSource): string {
  return `url(${JSON.stringify(source.resource)})${source.format ? ` format("${source.format}")` : ''}`;
}
