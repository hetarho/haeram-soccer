import type { ThemePack } from './contracts';

/** Optional UI roles are neutral per pack, never inherited from another theme's look. */
const STYLE_DEFAULTS = {
  'badge-radius': '2px',
  'scene-radius': '0px',
  'control-hover-filter': 'brightness(1.12)',
  'control-active-filter': 'var(--control-hover-filter)',
} as const;

/** The single bridge from pack namespaces to shared CSS/Canvas semantic roles. */
export function resolveThemeTokens(
  tokens: Pick<ThemePack['tokens'], 'palette' | 'surfaces' | 'shape' | 'typography'>,
  typography: Readonly<Record<string, string>> = tokens.typography,
): Readonly<Record<string, string>> {
  return Object.freeze({
    ...STYLE_DEFAULTS,
    ...tokens.palette,
    ...tokens.surfaces,
    ...tokens.shape,
    ...typography,
  });
}
