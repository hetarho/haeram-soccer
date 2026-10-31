import { z } from 'zod';
import {
  CREST_EMBLEMS,
  CREST_PATTERNS,
  CREST_SHAPES,
  DESIGN_STUDIOS,
  KIT_ROLES,
  KIT_WARNINGS,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type CrestDesign,
  type DesignCommission,
  type FixtureKitChoice,
  type GoalkeeperKit,
  type KitParts,
  type KitRole,
  type MatchAppearance,
  type ShirtDesign,
  type WornKeeper,
} from './identity';
import { SaveCompatibilityError } from './versions';

/** `#RRGGBB` in either hex case; the stored spelling is kept (KIT-1). */
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(100);
export const kitRoleSchema = z.enum(KIT_ROLES);

export const crestDesignSchema: z.ZodType<CrestDesign> = z.strictObject({
  shape: z.enum(CREST_SHAPES),
  pattern: z.enum(CREST_PATTERNS),
  emblem: z.enum(CREST_EMBLEMS),
  primary: colour,
  secondary: colour.optional(),
  accent: colour.optional(),
});
/** A plain shirt omits secondary; every patterned shirt names it (KIT-3, KIT-5). */
export const shirtDesignSchema: z.ZodType<ShirtDesign> = z
  .strictObject({
    pattern: z.enum(SHIRT_PATTERNS),
    primary: colour,
    secondary: colour.optional(),
    trim: colour.optional(),
  })
  .refine((shirt) => (shirt.pattern === 'plain') === (shirt.secondary === undefined), {
    message: 'plain shirts omit secondary; patterned shirts require it',
    path: ['secondary'],
  });
/** KIT-8: any shirt pattern with free colours, plus shorts, socks and gloves. */
export const goalkeeperKitSchema: z.ZodType<GoalkeeperKit> = z.strictObject({
  shirt: shirtDesignSchema,
  shorts: colour,
  socks: colour,
  gloves: colour,
});
const kitParts: z.ZodType<KitParts> = z.strictObject({
  shorts: colour.optional(),
  socks: colour.optional(),
});
/** Whether any kit has a part the owner set; empty entries set nothing. */
const setsPart = (parts: ClubIdentity['parts']) =>
  KIT_ROLES.some(
    (role) => parts?.[role]?.shorts !== undefined || parts?.[role]?.socks !== undefined,
  );
export const identityColoursSchema = z.union([
  z.tuple([colour]),
  z.tuple([colour, colour]),
  z.tuple([colour, colour, colour]),
]);
export const designStudioSchema = z.enum(DESIGN_STUDIOS);
const identityFields = {
  colours: identityColoursSchema,
  crest: crestDesignSchema,
  kits: z.strictObject({
    home: shirtDesignSchema,
    away: shirtDesignSchema,
    third: shirtDesignSchema,
  }),
};
/**
 * Version 1 is the shape older builds read, without parts or a goalkeeper kit. Version 2 sets at
 * least one part or carries a goalkeeper kit, so an older build reads it as a newer game rather
 * than as corruption (KIT-3, KIT-8, SAVE-20).
 */
export const clubIdentitySchema: z.ZodType<ClubIdentity> = z.union([
  z.strictObject({ version: z.literal(1), ...identityFields }),
  z
    .strictObject({
      version: z.literal(2),
      ...identityFields,
      parts: z
        .strictObject({
          home: kitParts.optional(),
          away: kitParts.optional(),
          third: kitParts.optional(),
        })
        .optional(),
      goalkeeper: goalkeeperKitSchema.optional(),
    })
    .refine((identity) => identity.goalkeeper !== undefined || setsPart(identity.parts), {
      message: 'version 2 sets a kit part or carries a goalkeeper kit',
    }),
]);
/**
 * A copy of `identity` in its canonical form: parts entries that set nothing are dropped, `parts`
 * goes when none is left, and the version follows what remains — 2 with a set part or a goalkeeper
 * kit, else 1.
 */
export function normaliseIdentity(identity: ClubIdentity): ClubIdentity {
  const { colours, crest, kits, parts, goalkeeper } = structuredClone(identity);
  const rest = { colours, crest, kits };
  const set: Partial<Record<KitRole, KitParts>> = {};
  for (const role of KIT_ROLES) {
    const { shorts, socks } = parts?.[role] ?? {};
    if (shorts === undefined && socks === undefined) continue;
    set[role] = {
      ...(shorts !== undefined ? { shorts } : {}),
      ...(socks !== undefined ? { socks } : {}),
    };
  }
  const hasParts = Object.keys(set).length > 0;
  if (!hasParts && !goalkeeper) return { version: 1, ...rest };
  return {
    version: 2,
    ...rest,
    ...(hasParts ? { parts: set } : {}),
    ...(goalkeeper ? { goalkeeper } : {}),
  };
}
/** A delivered set of drafts: at most the dearest designer's four. */
export const designCommissionSchema: z.ZodType<DesignCommission> = z.strictObject({
  studio: designStudioSchema,
  colours: identityColoursSchema,
  drafts: z.array(clubIdentitySchema).min(1).max(4),
});
export const fixtureKitChoiceSchema: z.ZodType<FixtureKitChoice> = z.strictObject({
  fixtureId: id,
  role: kitRoleSchema,
});
const wornKeeperSchema: z.ZodType<WornKeeper> = z.strictObject({
  shirt: shirtDesignSchema,
  shorts: colour,
  socks: colour,
  gloves: colour,
});
const sideFields = {
  club: id,
  crest: crestDesignSchema,
  role: kitRoleSchema,
  shirt: shirtDesignSchema,
  goalkeeper: colour,
};
/** Version 2 also records the worn shorts, socks and keeper kit; `goalkeeper` is its shirt base. */
const appearanceSideV2 = z
  .strictObject({
    ...sideFields,
    shorts: colour,
    socks: colour,
    keeper: wornKeeperSchema,
    keeperFallback: z.literal(true).optional(),
  })
  .refine((side) => side.goalkeeper === side.keeper.shirt.primary, {
    message: 'goalkeeper is the keeper shirt base colour',
    path: ['goalkeeper'],
  });
const appearanceSideV1 = z.strictObject(sideFields);
const warnings = z.array(z.enum(KIT_WARNINGS)).max(KIT_WARNINGS.length);
export const matchAppearanceSchema: z.ZodType<MatchAppearance> = z.union([
  z.strictObject({
    version: z.literal(1),
    sides: z.tuple([appearanceSideV1, appearanceSideV1]),
    warnings,
  }),
  z.strictObject({
    version: z.literal(2),
    sides: z.tuple([appearanceSideV2, appearanceSideV2]),
    warnings,
  }),
]);

/** The newest identity and appearance version this build reads. */
export const CURRENT_IDENTITY_VERSION = 2;
/** World.clubs and World.ownMatches limits of the world schema; larger inputs are not scanned. */
const MAX_CLUBS = 1000;
const MAX_RECORDS = 100000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A positive integer version above the current one comes from a newer game (SAVE-20–22). */
function assertVersion(value: unknown) {
  if (!record(value)) return;
  const version = value.version;
  if (
    typeof version === 'number' &&
    Number.isSafeInteger(version) &&
    version > CURRENT_IDENTITY_VERSION
  )
    throw new SaveCompatibilityError();
}
/** One appearance snapshot's version; missing, invalid or current markers go on to strict parsing. */
export function assertAppearanceFormatVersion(value: unknown): void {
  assertVersion(value);
}
/**
 * Bounded preflight over a World-shaped value: future `clubs[*].identity` or `ownMatches[*].appearance`
 * versions throw SaveCompatibilityError before Zod reports them as corruption. It neither validates
 * the World nor installs defaults.
 */
export function assertIdentityFormatVersions(value: unknown): void {
  if (!record(value)) return;
  const { clubs, ownMatches } = value;
  if (
    (Array.isArray(clubs) && clubs.length > MAX_CLUBS) ||
    (Array.isArray(ownMatches) && ownMatches.length > MAX_RECORDS)
  )
    throw new Error('저장 데이터의 크기가 허용 범위를 넘습니다.');
  if (Array.isArray(clubs))
    for (const club of clubs) if (record(club)) assertVersion(club.identity);
  if (Array.isArray(ownMatches))
    for (const match of ownMatches)
      if (record(match)) assertAppearanceFormatVersion(match.appearance);
}
