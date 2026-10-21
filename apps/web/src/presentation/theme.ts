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
import { resolveResourceUrl } from './registry';

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

function fontFamilies(value: string): string[] {
  return (value.match(/"[^"]+"|'[^']+'|[^,]+/g) ?? []).map((family) =>
    family.trim().replace(/^(['"])(.*)\1$/, '$2'),
  );
}

/** Shared installation check: cached Canvas stacks require a loadable primary face per role. */
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

  const sourceFonts = pack.fonts.map((font) => ({
    ...font,
    resource: resolveResourceUrl(font.resource, url),
  }));
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

/** Resolves only presentation data. The caller supplies the common era/completed-stage facts. */
export function createThemeResolver(input: ThemePack, options: { url: string }) {
  const pack = validateThemePack(input);
  const { fonts, tokens: typography } = validateThemeTypography(pack, options.url);
  const tokens: Readonly<Record<string, string>> = Object.freeze({
    ...pack.tokens.palette,
    ...pack.tokens.surfaces,
    ...pack.tokens.shape,
    ...typography,
  });
  const imageTreatment = Object.freeze({ ...pack.tokens.imageTreatment });

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
    stylesheet: pack.stylesheet ? resolveResourceUrl(pack.stylesheet, options.url) : undefined,
    token,
    icon,
    facility,
  };
}

export type ThemeResolver = ReturnType<typeof createThemeResolver>;
