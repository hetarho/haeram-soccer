import type { ThemePack } from './contracts';

/** Optional UI roles are neutral per pack, never inherited from another theme's look. */
const STYLE_DEFAULTS = {
  'badge-radius': '2px',
  'scene-radius': '0px',
  'feedback-shadow-filter': 'none',
  'feedback-edge-shadow': 'none',
  'control-fill': 'var(--surface-2)',
  'secondary-fill': 'var(--surface-2)',
  'secondary-material': 'var(--image-quiet-material, none)',
  'secondary-frame': 'var(--image-panel-frame)',
  'control-weight': '700',
  'nav-surface': 'var(--surface-deep)',
  'nav-edge': 'var(--line)',
  'nav-shadow': 'none',
  'nav-radius': 'var(--card-radius)',
  'popover-shadow': 'none',
  'popover-edge': 'var(--line)',
  'control-hover-filter': 'brightness(1.12)',
  'control-active-filter': 'var(--control-hover-filter)',
} as const;

/** The single bridge from pack namespaces to shared CSS/Canvas semantic roles. */
export function resolveThemeTokens(
  tokens: Pick<ThemePack['tokens'], 'palette' | 'surfaces' | 'shape' | 'typography' | 'ui'>,
  typography: Readonly<Record<string, string>> = tokens.typography,
): Readonly<Record<string, string>> {
  return Object.freeze({
    ...STYLE_DEFAULTS,
    'secondary-text': tokens.palette.text,
    'secondary-muted': tokens.palette['text-muted'],
    ...tokens.palette,
    ...tokens.surfaces,
    ...tokens.shape,
    ...typography,
    ...tokens.ui,
  });
}
