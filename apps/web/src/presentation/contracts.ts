import { z } from 'zod';

export type PackKind = 'locale' | 'theme';
export type TextDirection = 'ltr' | 'rtl';

export interface PackRegistryEntry {
  id: string;
  label: string;
  resource: string;
}
export interface LocaleRegistryEntry extends PackRegistryEntry {
  direction: TextDirection;
}
export type ThemeRegistryEntry = PackRegistryEntry;
export type RegistryEntry<K extends PackKind = PackKind> = K extends 'locale'
  ? LocaleRegistryEntry
  : ThemeRegistryEntry;
export interface PackRegistry<K extends PackKind = PackKind> {
  schemaVersion: 1;
  defaultId: string;
  entries: RegistryEntry<K>[];
}

export type MessageParameters = Readonly<Record<string, string | number>>;
export interface PluralMessage {
  plural: string;
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
}
export type LocaleMessage = string | PluralMessage;
export interface LocalePack {
  schemaVersion: 1;
  id: string;
  messages: Record<string, LocaleMessage>;
}

/** Semantic roles are shared by every pack; pack identities are never enumerated. */
export const THEME_TOKEN_KEYS = {
  palette: [
    'bg',
    'text',
    'text-muted',
    'text-faint',
    'accent',
    'accent-fill',
    'accent-edge',
    'accent-text',
    'on-accent',
    'positive',
    'gold',
    'gold-fill',
    'gold-edge',
    'warm',
    'warm-soft',
    'cool',
    'cool-soft',
    'danger',
    'focus',
  ],
  surfaces: [
    'surface-deep',
    'surface',
    'surface-2',
    'surface-3',
    'line',
    'line-strong',
    'paper',
    'hud',
  ],
  typography: ['body', 'display', 'score'],
  shape: ['radius', 'shadow'],
} as const;
export const THEME_ICON_ROLES = [
  'home',
  'ball',
  'table',
  'cup',
  'people',
  'training',
  'trend',
  'history',
  'menu',
  'more',
  'switch',
  'bell',
  'news',
  'eye',
  'play',
  'pause',
  'replay',
  'close',
  'chevronDown',
  'chevronRight',
  'chevronLeft',
  'check',
  'filter',
  'star',
  'liddedCup',
  'continentalCup',
  'medal',
  'promotion',
  'relegation',
  'trophy.league',
  'trophy.cup',
  'trophy.continental',
  'trophy.final',
  'trophy.promotion',
  'trophy.relegation',
  'trophy.best',
] as const;
export const FACILITY_ERAS = ['heritage', 'terraces', 'contemporary'] as const;
export const FACILITY_KINDS = [
  'stadium',
  'locker',
  'training',
  'manager',
  'staff',
  'academy',
] as const;
export type FacilityEra = (typeof FACILITY_ERAS)[number];
export type FacilityKind = (typeof FACILITY_KINDS)[number];

export interface FontSource {
  resource: string;
  format?: 'woff2' | 'woff' | 'opentype' | 'truetype';
}
export interface FontResource extends FontSource {
  family: string;
  weight: string;
  /** Ordered representations of the same face, attempted only after earlier sources fail. */
  fallbacks?: FontSource[];
  style?: 'normal' | 'italic' | 'oblique';
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}
export interface IconLayer {
  d: string;
  fill?: string;
  fillRule?: 'nonzero' | 'evenodd';
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  opacity?: number;
}
export type IconResource =
  | {
      type: 'svg';
      viewBox: string;
      shapeRendering?: 'auto' | 'crispEdges' | 'geometricPrecision';
      layers: IconLayer[];
    }
  | { type: 'image'; resource: string; width?: number; height?: number };
export interface ThemeIcon {
  default: IconResource;
  variants?: Record<string, IconResource>;
}
export interface ImageTreatment {
  objectFit: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  objectPosition: string;
  imageRendering: 'auto' | 'pixelated' | 'crisp-edges';
  filter: string;
  overlay: string;
}
export interface SemanticImageSlot {
  /** Resolves common {era}, {kind}, {stage} selections; values never choose game state. */
  pattern: string;
  /** Optional same-role exceptions, keyed as era.kind.stage. */
  overrides?: Record<string, string>;
}
/** Source-pixel insets also describe native cap-inset / nine-patch resources. */
export interface UiImageResource {
  resource: string;
  width: number;
  height: number;
  mode: 'image' | 'tile' | 'nine-slice';
  slice?: number;
  preload?: boolean;
}
export interface FacilityImageVariant extends SemanticImageSlot {
  width: number;
  height: number;
}
export interface ThemePack {
  schemaVersion: 1;
  id: string;
  colorScheme?: 'dark' | 'light' | 'normal';
  tokens: {
    palette: Record<string, string>;
    surfaces: Record<string, string>;
    typography: Record<string, string>;
    shape: Record<string, string>;
    ui?: Record<string, string>;
    imageTreatment: ImageTreatment;
  };
  fonts: FontResource[];
  images: {
    facility: SemanticImageSlot & { variants?: FacilityImageVariant[] };
    ui?: Record<string, UiImageResource>;
  };
  icons: Record<string, ThemeIcon>;
  stylesheet?: string;
}
export type PackFor<K extends PackKind> = K extends 'locale' ? LocalePack : ThemePack;

export class PresentationValidationError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'PresentationValidationError';
  }
}

const nonempty = z.string().trim().min(1);
export const packIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/)
  .max(80);
export const localeIdSchema = packIdSchema.refine((value) => {
  try {
    Intl.getCanonicalLocales(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid locale ID');
const semanticId = z.string().regex(/^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/);
const parameterName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Local references only; same-origin resolution is checked again against the declaring URL. */
export function isResourceReference(value: string, relativeOnly = false): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !/[\\\s\u0000-\u001f\u007f{}]/.test(value) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) &&
    !value.startsWith('//') &&
    !value.startsWith('#') &&
    !value.startsWith('?') &&
    (!relativeOnly || !value.startsWith('/'))
  );
}
export const resourceReferenceSchema = z
  .string()
  .refine(isResourceReference, 'Expected a local resource URL');
export const relativeResourceSchema = z
  .string()
  .refine((value) => isResourceReference(value, true), 'Expected a relative resource URL');

export function parsePresentation<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PresentationValidationError(
      `${label}: ${issue.path.join('.') || 'value'}: ${issue.message}`,
    );
  }
  return result.data;
}

function templateParameters(template: string): string[] {
  const names = new Set<string>();
  const rest = template.replace(/\{([^{}]*)\}/g, (_, name: string) => {
    if (!parameterName.test(name))
      throw new PresentationValidationError(`Invalid message parameter: ${name}`);
    names.add(name);
    return '';
  });
  if (/[{}]/.test(rest)) throw new PresentationValidationError('Unbalanced message placeholders');
  return [...names].sort();
}
const templateSchema = z.string().superRefine((value, ctx) => {
  try {
    templateParameters(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message });
  }
});
const pluralSchema = z
  .strictObject({
    plural: z.string().regex(parameterName),
    forms: z.strictObject({
      zero: templateSchema.optional(),
      one: templateSchema.optional(),
      two: templateSchema.optional(),
      few: templateSchema.optional(),
      many: templateSchema.optional(),
      other: templateSchema,
    }),
  })
  .superRefine((value, ctx) => {
    const parameterSets = Object.values(value.forms).map((template) =>
      templateParameters(template)
        .filter((name) => name !== value.plural)
        .join(','),
    );
    if (new Set(parameterSets).size > 1)
      ctx.addIssue({ code: 'custom', message: 'Plural forms must use the same named parameters' });
  });
const messageSchema = z.union([templateSchema, pluralSchema]);
const localeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: localeIdSchema,
  messages: z
    .record(semanticId, messageSchema)
    .refine((messages) => Object.keys(messages).length > 0, 'Messages are empty'),
});

export function validateMessage(value: unknown): LocaleMessage {
  return parsePresentation(messageSchema, value, 'Message');
}
/** Includes the plural selector even when a form does not display its numeric value. */
export function getMessageParameters(message: LocaleMessage): string[] {
  return typeof message === 'string'
    ? templateParameters(message)
    : [
        ...new Set([message.plural, ...Object.values(message.forms).flatMap(templateParameters)]),
      ].sort();
}
export function selectPluralTemplate(
  message: PluralMessage,
  locale: string,
  count: number,
): string {
  if (!Number.isFinite(count))
    throw new PresentationValidationError('Plural parameter must be a finite number');
  return message.forms[new Intl.PluralRules(locale).select(count)] ?? message.forms.other;
}
/** A partial translation may omit baseline keys, but cannot change their parameter contract. */
export function validateLocalePack(value: unknown, baseline?: LocalePack): LocalePack {
  const pack = parsePresentation(localeSchema, value, 'Locale pack');
  if (baseline)
    for (const [key, message] of Object.entries(pack.messages)) {
      if (!Object.hasOwn(baseline.messages, key))
        throw new PresentationValidationError(`Unknown message key: ${key}`);
      const expected = baseline.messages[key];
      if (
        getMessageParameters(message).join(',') !== getMessageParameters(expected).join(',') ||
        (typeof message !== 'string' &&
          typeof expected !== 'string' &&
          message.plural !== expected.plural)
      )
        throw new PresentationValidationError(`Message parameters differ from the default: ${key}`);
    }
  return pack;
}

function tokensSchema(required: readonly string[]) {
  return z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), nonempty).superRefine((tokens, ctx) => {
    for (const key of required)
      if (!Object.hasOwn(tokens, key))
        ctx.addIssue({ code: 'custom', path: [key], message: 'Missing required semantic token' });
  });
}
const fontSourceSchema = z.strictObject({
  resource: resourceReferenceSchema,
  format: z.enum(['woff2', 'woff', 'opentype', 'truetype']).optional(),
});
const fontSchema = z.strictObject({
  ...fontSourceSchema.shape,
  family: nonempty,
  fallbacks: z.array(fontSourceSchema).optional(),
  weight: z.string().refine((value) => {
    const weights = value.split(' ').map(Number);
    return (
      /^\d{1,4}(?: \d{1,4})?$/.test(value) &&
      weights.every((n) => n >= 1 && n <= 1000) &&
      (weights.length === 1 || weights[0] <= weights[1])
    );
  }, 'Invalid font weight or range'),
  style: z.enum(['normal', 'italic', 'oblique']).optional(),
  display: z.enum(['auto', 'block', 'swap', 'fallback', 'optional']).optional(),
});
const iconSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('svg'),
    viewBox: z.string().refine((value) => {
      const numbers = value
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      return (
        numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0
      );
    }, 'Invalid SVG viewBox'),
    shapeRendering: z.enum(['auto', 'crispEdges', 'geometricPrecision']).optional(),
    layers: z
      .array(
        z.strictObject({
          d: nonempty.regex(/^[Mm][0-9eE\s.,+\-MmZzLlHhVvCcSsQqTtAa]+$/, 'Invalid SVG path data'),
          fill: nonempty.optional(),
          fillRule: z.enum(['nonzero', 'evenodd']).optional(),
          stroke: nonempty.optional(),
          strokeWidth: z.number().finite().nonnegative().optional(),
          strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
          strokeLinejoin: z.enum(['miter', 'round', 'bevel']).optional(),
          opacity: z.number().min(0).max(1).optional(),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    type: z.literal('image'),
    resource: resourceReferenceSchema,
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
]);
const facilitySlotSchema = z.strictObject({
  pattern: z.string().refine((pattern) => {
    try {
      const parameters = templateParameters(pattern);
      return (
        parameters.join(',') === 'era,kind,stage' &&
        isResourceReference(pattern.replace(/\{(?:era|kind|stage)\}/g, 'slot'))
      );
    } catch {
      return false;
    }
  }, 'Expected a local image pattern with {era}, {kind}, and {stage}'),
  overrides: z
    .record(
      z
        .string()
        .regex(
          new RegExp(
            `^(${FACILITY_ERAS.join('|')})\\.(${FACILITY_KINDS.join('|')})\\.(0|[1-9][0-9]*)$`,
          ),
        ),
      resourceReferenceSchema,
    )
    .optional(),
});
const themeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: packIdSchema,
  colorScheme: z.enum(['dark', 'light', 'normal']).optional(),
  tokens: z.strictObject({
    palette: tokensSchema(THEME_TOKEN_KEYS.palette),
    surfaces: tokensSchema(THEME_TOKEN_KEYS.surfaces),
    typography: tokensSchema(THEME_TOKEN_KEYS.typography),
    shape: tokensSchema(THEME_TOKEN_KEYS.shape),
    ui: tokensSchema([]).optional(),
    imageTreatment: z.strictObject({
      objectFit: z.enum(['cover', 'contain', 'fill', 'none', 'scale-down']),
      objectPosition: nonempty,
      imageRendering: z.enum(['auto', 'pixelated', 'crisp-edges']),
      filter: nonempty,
      overlay: nonempty,
    }),
  }),
  fonts: z.array(fontSchema).min(1),
  images: z.strictObject({
    facility: facilitySlotSchema.extend({
      variants: z
        .array(
          facilitySlotSchema.extend({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          }),
        )
        .optional(),
    }),
    ui: z
      .record(
        z.string().regex(/^[a-z][a-z0-9-]*$/),
        z
          .strictObject({
            resource: resourceReferenceSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            mode: z.enum(['image', 'tile', 'nine-slice']),
            slice: z.number().int().positive().optional(),
            preload: z.boolean().optional(),
          })
          .superRefine((image, ctx) => {
            if (
              image.mode === 'nine-slice' &&
              (!image.slice || image.slice * 2 >= Math.min(image.width, image.height))
            )
              ctx.addIssue({
                code: 'custom',
                path: ['slice'],
                message: 'Invalid nine-slice insets',
              });
            if (image.mode !== 'nine-slice' && image.slice !== undefined)
              ctx.addIssue({
                code: 'custom',
                path: ['slice'],
                message: 'Only nine-slice images have insets',
              });
          }),
      )
      .optional(),
  }),
  icons: z
    .record(
      semanticId,
      z.strictObject({
        default: iconSchema,
        variants: z.record(semanticId, iconSchema).optional(),
      }),
    )
    .superRefine((icons, ctx) => {
      for (const role of THEME_ICON_ROLES)
        if (!Object.hasOwn(icons, role))
          ctx.addIssue({ code: 'custom', path: [role], message: 'Missing required semantic icon' });
    }),
  stylesheet: resourceReferenceSchema.optional(),
});
export function validateThemePack(value: unknown): ThemePack {
  return parsePresentation(themeSchema, value, 'Theme pack');
}
