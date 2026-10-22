import {
  FACILITY_ERAS,
  FACILITY_KINDS,
  PresentationValidationError,
  validateThemePack,
  type FacilityEra,
  type FacilityKind,
  type FontResource,
  type IconResource,
  type ThemePack,
} from './contracts';
import { resolveFontResource } from './fonts';
import { resolveResourceUrl } from './registry';
import { resolveThemeTokens } from './themeTokens';

/** These names remain valid in text renderers that cache a computed font stack. */
export const THEME_FONT_ALIASES = {
  body: 'Haeram Presentation Body',
  display: 'Haeram Presentation Display',
  score: 'Haeram Presentation Score',
} as const;

export interface FacilityImageSelection {
  era: FacilityEra;
  kind: FacilityKind;
  stage: number;
}
export type ThemeImageNeed =
  | { type: 'icon'; role: string; variant?: string }
  | ({ type: 'facility' } & FacilityImageSelection);

function fontFamilies(value: string): string[] {
  return (value.match(/"[^"]+"|'[^']+'|[^,]+/g) ?? []).map((family) =>
    family.trim().replace(/^(['"])(.*)\1$/, '$2'),
  );
}

/**
 * Semantic check after validateThemePack's shape validation. Cached Canvas stacks require
 * a declared, loadable primary face per role; pack tooling can reuse this same check.
 */
export function validateThemeTypography(pack: ThemePack, url = '/') {
  const typography = pack.tokens.typography;
  const resolved = new Map<string, string>();
  function valueFor(role: string, visited = new Set<string>()): string {
    if (resolved.has(role)) return resolved.get(role)!;
    if (visited.has(role)) throw new PresentationValidationError('Cyclic typography aliases');
    visited.add(role);
    const value = typography[role];
    if (!value) throw new PresentationValidationError(`Missing typography alias: ${role}`);
    const result = value.replace(/var\(--([a-z][a-z0-9-]*)\)/g, (_, key: string) =>
      valueFor(key, visited),
    );
    visited.delete(role);
    resolved.set(role, result);
    return result;
  }

  const sourceFonts = pack.fonts.map((font) => resolveFontResource(font, url));
  const primary = Object.fromEntries(
    Object.keys(THEME_FONT_ALIASES).map((role) => [role, fontFamilies(valueFor(role))[0]]),
  );
  const fonts: FontResource[] = sourceFonts.filter(
    (font) => !Object.values(primary).includes(font.family),
  );
  const tokens = { ...typography };
  for (const [role, alias] of Object.entries(THEME_FONT_ALIASES)) {
    const faces = sourceFonts.filter((font) => font.family === primary[role]);
    if (!faces.length)
      throw new PresentationValidationError(
        `Typography ${role} must start with a declared font family`,
      );
    fonts.push(...faces.map((font) => ({ ...font, family: alias })));
    const families = fontFamilies(valueFor(role));
    tokens[role] = families
      .map((family, index) => {
        if (index === 0) return `'${alias}'`;
        const fallbackRole = Object.keys(THEME_FONT_ALIASES).find(
          (key) => primary[key] === family,
        ) as keyof typeof THEME_FONT_ALIASES | undefined;
        return fallbackRole ? `'${THEME_FONT_ALIASES[fallbackRole]}'` : family;
      })
      .join(', ');
  }
  return { fonts, tokens };
}

/**
 * Applies shared shape and semantic checks, then resolves presentation data only.
 * The caller supplies the common era/completed-stage facts.
 */
export function createThemeResolver(input: ThemePack, options: { url: string }) {
  const pack = validateThemePack(input);
  const { fonts, tokens: typography } = validateThemeTypography(pack, options.url);
  const tokens = resolveThemeTokens(pack.tokens, typography);
  const imageTreatment = Object.freeze({ ...pack.tokens.imageTreatment });
  const iconImages = Object.freeze([
    ...new Set(
      Object.values(pack.icons)
        .flatMap((entry) => [entry.default, ...Object.values(entry.variants ?? {})])
        .flatMap((resource) =>
          resource.type === 'image' ? [resolveResourceUrl(resource.resource, options.url)] : [],
        ),
    ),
  ]);

  function icon(role: string, variant?: string): IconResource {
    if (!Object.hasOwn(pack.icons, role))
      throw new PresentationValidationError(`Unknown semantic icon: ${role}`);
    const entry = pack.icons[role];
    // Variants are optional: their explicit fallback is this same semantic role's default.
    const resource =
      variant && entry.variants && Object.hasOwn(entry.variants, variant)
        ? entry.variants[variant]
        : entry.default;
    return resource.type === 'image'
      ? { ...resource, resource: resolveResourceUrl(resource.resource, options.url) }
      : resource;
  }

  function facility({ era, kind, stage }: FacilityImageSelection) {
    if (
      !FACILITY_ERAS.includes(era) ||
      !FACILITY_KINDS.includes(kind) ||
      !Number.isInteger(stage) ||
      stage < 0
    )
      throw new PresentationValidationError('Invalid semantic facility selection');
    const slot = pack.images.facility;
    const reference =
      slot.overrides?.[`${era}.${kind}.${stage}`] ??
      slot.pattern.replace(/\{(era|kind|stage)\}/g, (_, key: string) =>
        String({ era, kind, stage }[key as 'era' | 'kind' | 'stage']),
      );
    return {
      src: resolveResourceUrl(reference, options.url),
      era,
      kind,
      stage,
      treatment: imageTreatment,
    };
  }

  function token(key: string): string {
    if (!Object.hasOwn(tokens, key))
      throw new PresentationValidationError(`Unknown semantic token: ${key}`);
    return tokens[key];
  }

  return {
    id: pack.id,
    pack,
    tokens,
    fonts,
    colorScheme: pack.colorScheme ?? 'normal',
    imageTreatment,
    iconImages,
    stylesheet: pack.stylesheet ? resolveResourceUrl(pack.stylesheet, options.url) : undefined,
    token,
    icon,
    facility,
  };
}

export type ThemeResolver = ReturnType<typeof createThemeResolver>;

/** Current semantic needs resolve against the candidate pack, never against old resource URLs. */
export function collectThemeImageResources(theme: ThemeResolver, needs: readonly ThemeImageNeed[]) {
  return [
    ...new Set(
      needs.flatMap((need) => {
        if (need.type === 'facility') return [theme.facility(need).src];
        const resource = theme.icon(need.role, need.variant);
        return resource.type === 'image' ? [resource.resource] : [];
      }),
    ),
  ];
}
