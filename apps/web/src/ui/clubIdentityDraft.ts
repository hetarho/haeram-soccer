import {
  CREST_EMBLEMS,
  CREST_PATTERNS,
  CREST_PRESETS,
  CREST_SHAPES,
  KIT_ROLES,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type CrestDesign,
  type CrestEmblem,
  type CrestPattern,
  type CrestShape,
  type IdentityColours,
  type KitRole,
  type ShirtDesign,
  type ShirtPattern,
} from '../../../../packages/contracts/src/identity';

/**
 * KIT-2/4/5/9/10/14, WEB-86: the club-design editor's draft as a pure reducer
 * (spec/ssot/KIT.md). Each action returns a new identity that shares every branch
 * it did not change and never writes to its input, so the entry and applied identities, and the
 * shirts not being edited, cannot change through a draft. The selected role and an open composer are
 * the editor's own UI state, not part of the identity.
 */
export type IdentityDraftAction =
  /** One of the three named shirt colours, linked to the crest and other shirt regions. */
  | { type: 'kit-colour'; role: KitRole; colour: string }
  /** A locally drawn composition, with all current colours and shirts preserved. */
  | { type: 'crest-random'; shape: CrestShape; pattern: CrestPattern; emblem: CrestEmblem }
  /** Legacy v1 palette operation, retained for existing identity fixtures. */
  | { type: 'colour'; index: 0 | 1 | 2; colour: string }
  /** Legacy v1 palette operation, up to three colours. */
  | { type: 'add-colour'; colour: string }
  /** Removes the second or third representative colour; the main one always stays. */
  | { type: 'remove-colour'; index: 1 | 2 }
  /** One of the six ready-made crests: its parts in the crest's current colours (KIT-2/14). */
  | { type: 'crest-preset'; index: number }
  /** 직접 꾸미기: one part of the crest. */
  | { type: 'crest-part'; part: 'shape'; value: CrestShape }
  | { type: 'crest-part'; part: 'pattern'; value: CrestPattern }
  | { type: 'crest-part'; part: 'emblem'; value: CrestEmblem }
  /** A crest colour region; null removes the optional secondary or accent (negative space). */
  | { type: 'crest-colour'; region: 'primary'; colour: string }
  | { type: 'crest-colour'; region: 'secondary' | 'accent'; colour: string | null }
  /** The pattern of one shirt; plain drops its secondary, a pattern supplies one (KIT-5). */
  | { type: 'shirt-pattern'; role: KitRole; pattern: ShirtPattern }
  /** A colour region of one shirt; null removes its optional trim. */
  | { type: 'shirt-colour'; role: KitRole; region: 'primary' | 'secondary'; colour: string }
  | { type: 'shirt-colour'; role: KitRole; region: 'trim'; colour: string | null }
  /** Legacy v1 palette copy, retained for existing identity fixtures. */
  | { type: 'shirt-reuse'; role: KitRole }
  /** 취소/되돌리기: an independent copy of the identity the editor was opened with (WEB-86). */
  | { type: 'reset'; entry: ClubIdentity };

const HEX = /^#[0-9a-fA-F]{6}$/;
/** The crest component catalogue of KIT-2, by part. */
const PARTS: Record<'shape' | 'pattern' | 'emblem', readonly string[]> = {
  shape: CREST_SHAPES,
  pattern: CREST_PATTERNS,
  emblem: CREST_EMBLEMS,
};
/** Whether a colour may enter a draft: `#RRGGBB` in either case, the spelling kept (KIT-1). */
const isDraftColour = (colour: string) => HEX.test(colour);
/**
 * A colour typed into the editor, as a draft colour: `#RRGGBB`, or the six digits without `#`.
 * Anything else is null and stays an input error of the editor, never an action.
 */
export function colourInput(text: string): string | null {
  const value = text.trim();
  const colour = value.startsWith('#') ? value : `#${value}`;
  return isDraftColour(colour) ? colour : null;
}

/** A crest with only the optional colours that are set. */
function crestOf(
  parts: Pick<CrestDesign, 'shape' | 'pattern' | 'emblem'>,
  primary: string,
  secondary: string | undefined,
  accent: string | undefined,
): CrestDesign {
  return {
    shape: parts.shape,
    pattern: parts.pattern,
    emblem: parts.emblem,
    primary,
    ...(secondary !== undefined ? { secondary } : {}),
    ...(accent !== undefined ? { accent } : {}),
  };
}
/** A shirt with a secondary only when patterned and a trim only when set (KIT-4). */
function shirtOf(
  pattern: ShirtPattern,
  primary: string,
  secondary: string | undefined,
  trim: string | undefined,
): ShirtDesign {
  return {
    pattern,
    primary,
    ...(pattern !== 'plain' && secondary !== undefined ? { secondary } : {}),
    ...(trim !== undefined ? { trim } : {}),
  };
}
/** A deep copy holding only the identity's own fields. */
export function cloneIdentity(identity: ClubIdentity): ClubIdentity {
  const { crest, kits } = identity;
  const shirt = (role: KitRole) =>
    shirtOf(kits[role].pattern, kits[role].primary, kits[role].secondary, kits[role].trim);
  return {
    version: 1,
    colours: [...identity.colours] as IdentityColours,
    crest: crestOf(crest, crest.primary, crest.secondary, crest.accent),
    kits: { home: shirt('home'), away: shirt('away'), third: shirt('third') },
  };
}

const withShirt = (value: ClubIdentity, role: KitRole, shirt: ShirtDesign): ClubIdentity => ({
  ...value,
  kits: { ...value.kits, [role]: shirt },
});
const withCrest = (value: ClubIdentity, crest: CrestDesign): ClubIdentity => ({ ...value, crest });
const crestInKitColours = (
  value: ClubIdentity,
  parts: Pick<CrestDesign, 'shape' | 'pattern' | 'emblem'>,
) => crestOf(parts, value.kits.home.primary, value.kits.away.primary, undefined);

/** KIT-1/4/10: the editor's only palette is the three shirt bases. */
export function linkedIdentityColours(value: ClubIdentity): ClubIdentity {
  const { home, away, third } = value.kits;
  const shirt = (role: KitRole) => {
    const current = value.kits[role];
    const second = role === 'home' ? away.primary : home.primary;
    return shirtOf(
      current.pattern,
      current.primary,
      second,
      current.trim === undefined ? undefined : second,
    );
  };
  return {
    ...value,
    colours: [home.primary, away.primary, third.primary],
    crest: crestInKitColours(value, value.crest),
    kits: { home: shirt('home'), away: shirt('away'), third: shirt('third') },
  };
}

/** Uniformly choose one of the other catalogue compositions, without a sporting PRNG. */
export function randomCrestAction(
  crest: CrestDesign,
  random: () => number = Math.random,
): Extract<IdentityDraftAction, { type: 'crest-random' }> {
  const patterns = CREST_PATTERNS.length;
  const emblems = CREST_EMBLEMS.length;
  const current =
    (CREST_SHAPES.indexOf(crest.shape) * patterns + CREST_PATTERNS.indexOf(crest.pattern)) *
      emblems +
    CREST_EMBLEMS.indexOf(crest.emblem);
  const alternatives = CREST_SHAPES.length * patterns * emblems - 1;
  const drawn = Math.floor(random() * alternatives);
  const index = drawn >= current ? drawn + 1 : drawn;
  return {
    type: 'crest-random',
    shape: CREST_SHAPES[Math.floor(index / (patterns * emblems))]!,
    pattern: CREST_PATTERNS[Math.floor(index / emblems) % patterns]!,
    emblem: CREST_EMBLEMS[index % emblems]!,
  };
}

/**
 * The draft after one editor action. An action that cannot apply — an invalid colour, a region the
 * design does not have, removing a required colour, a fourth or a missing representative colour,
 * an unknown preset, part or pattern — returns `value` itself, so every result is a complete
 * identity the strict identity schema accepts.
 */
export function reduceIdentityDraft(
  value: ClubIdentity,
  action: IdentityDraftAction,
): ClubIdentity {
  if ('colour' in action) {
    // Only the optional regions — crest secondary/accent and shirt trim — can be removed.
    const optional =
      (action.type === 'crest-colour' && action.region !== 'primary') ||
      (action.type === 'shirt-colour' && action.region === 'trim');
    if (action.colour === null ? !optional : !isDraftColour(action.colour)) return value;
  }
  const { colours, crest } = value;
  switch (action.type) {
    case 'kit-colour':
      return KIT_ROLES.includes(action.role)
        ? linkedIdentityColours(
            withShirt(value, action.role, { ...value.kits[action.role], primary: action.colour }),
          )
        : value;
    case 'crest-random':
      return CREST_SHAPES.includes(action.shape) &&
        CREST_PATTERNS.includes(action.pattern) &&
        CREST_EMBLEMS.includes(action.emblem)
        ? withCrest(value, crestInKitColours(value, action))
        : value;
    case 'colour': {
      if (action.index >= colours.length) return value;
      const next = [...colours] as IdentityColours;
      next[action.index] = action.colour;
      return { ...value, colours: next };
    }
    case 'add-colour':
      return colours.length < 3
        ? { ...value, colours: [...colours, action.colour] as IdentityColours }
        : value;
    case 'remove-colour':
      return action.index < colours.length
        ? { ...value, colours: colours.filter((_, i) => i !== action.index) as IdentityColours }
        : value;
    case 'crest-preset': {
      const preset = CREST_PRESETS[action.index];
      return preset ? withCrest(value, crestInKitColours(value, preset)) : value;
    }
    case 'crest-part':
      return PARTS[action.part].includes(action.value)
        ? withCrest(value, crestInKitColours(value, { ...crest, [action.part]: action.value }))
        : value;
    case 'crest-colour': {
      const { region, colour } = action;
      const pick = (key: 'secondary' | 'accent') =>
        region === key ? (colour ?? undefined) : crest[key];
      return withCrest(
        value,
        crestOf(
          crest,
          region === 'primary' ? action.colour : crest.primary,
          pick('secondary'),
          pick('accent'),
        ),
      );
    }
    case 'shirt-pattern': {
      if (!(SHIRT_PATTERNS as readonly string[]).includes(action.pattern)) return value;
      const shirt = value.kits[action.role];
      // Entering a pattern uses the linked alternate base when no secondary is present yet.
      const secondary =
        shirt.secondary ?? value.kits[action.role === 'home' ? 'away' : 'home'].primary;
      return withShirt(
        value,
        action.role,
        shirtOf(action.pattern, shirt.primary, secondary, shirt.trim),
      );
    }
    case 'shirt-colour': {
      const shirt = value.kits[action.role];
      if (action.region === 'secondary' && shirt.pattern === 'plain') return value;
      const pick = (key: 'primary' | 'secondary' | 'trim') =>
        action.region === key ? (action.colour ?? undefined) : shirt[key];
      return withShirt(
        value,
        action.role,
        shirtOf(shirt.pattern, pick('primary')!, pick('secondary'), pick('trim')),
      );
    }
    case 'shirt-reuse': {
      const { pattern } = value.kits[action.role];
      const [main, second, third] = colours;
      const trim = pattern === 'plain' ? (third ?? second) : third;
      return withShirt(value, action.role, shirtOf(pattern, main, second ?? main, trim));
    }
    case 'reset':
      return cloneIdentity(action.entry);
    default: {
      const unknown: never = action;
      throw new Error(`알 수 없는 디자인 편집입니다: ${JSON.stringify(unknown)}`);
    }
  }
}
