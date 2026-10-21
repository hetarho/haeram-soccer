import { describe, expect, it } from 'vitest';
import {
  CREST_PRESETS,
  CREST_SHAPES,
  CREST_PATTERNS,
  CREST_EMBLEMS,
  KIT_ROLES,
  type ClubIdentity,
} from '../../../../packages/contracts/src/identity';
import { clubIdentitySchema } from '../../../../packages/contracts/src/identitySchema';
import {
  cloneIdentity,
  colourInput,
  linkedIdentityColours,
  randomCrestAction,
  reduceIdentityDraft,
  type IdentityDraftAction,
} from './clubIdentityDraft';

/** Frozen all the way down: any write to an input branch throws in these strict-mode modules. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
/** An applied identity as the editor receives it, with mixed-case stored spellings. */
const ENTRY: ClubIdentity = deepFreeze({
  version: 1,
  colours: ['#d62828', '#FFFFFF'],
  crest: {
    shape: 'shield',
    pattern: 'stripes',
    emblem: 'star',
    primary: '#d62828',
    secondary: '#FFFFFF',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#d62828', secondary: '#FFFFFF' },
    away: { pattern: 'plain', primary: '#ffffff', trim: '#d62828' },
    third: { pattern: 'hoops', primary: '#0b1f44', secondary: '#fcbf49', trim: '#FFFFFF' },
  },
} satisfies ClubIdentity);
const SNAPSHOT = structuredClone(ENTRY);
const apply = (value: ClubIdentity, ...actions: IdentityDraftAction[]) =>
  actions.reduce(reduceIdentityDraft, value);
/** The schema accepts it unchanged and no field is present but undefined. */
function valid(value: ClubIdentity) {
  expect(clubIdentitySchema.parse(value)).toEqual(value);
  expect(value).toStrictEqual(JSON.parse(JSON.stringify(value)));
}
const others = (role: string) => KIT_ROLES.filter((r) => r !== role);

describe('club identity draft reducer (→KIT-9/10, WEB-86)', () => {
  it('changes only the representative colours and keeps every shirt and the crest', () => {
    const next = apply(
      ENTRY,
      { type: 'colour', index: 0, colour: '#1f4fd1' },
      { type: 'add-colour', colour: '#fcbf49' },
    );
    expect(next.colours).toEqual(['#1f4fd1', '#FFFFFF', '#fcbf49']);
    expect(next.kits).toBe(ENTRY.kits);
    expect(next.crest).toBe(ENTRY.crest);
    expect(next.kits).toEqual(SNAPSHOT.kits);
    valid(next);
    const fewer = apply(next, { type: 'remove-colour', index: 1 });
    expect(fewer.colours).toEqual(['#1f4fd1', '#fcbf49']);
    expect(fewer.kits).toBe(ENTRY.kits);
  });

  it('copies the representative colours into the selected shirt only, keeping its pattern', () => {
    const three = apply(ENTRY, { type: 'add-colour', colour: '#fcbf49' });
    for (const role of KIT_ROLES) {
      const next = reduceIdentityDraft(three, { type: 'shirt-reuse', role });
      expect(next.kits[role].pattern).toBe(ENTRY.kits[role].pattern);
      for (const other of others(role)) {
        expect(next.kits[other]).toBe(ENTRY.kits[other]);
        expect(next.kits[other]).toEqual(SNAPSHOT.kits[other]);
      }
      expect(next.colours).toBe(three.colours);
      expect(next.crest).toBe(ENTRY.crest);
      valid(next);
    }
    // Patterned: main, secondary and trim from the three colours.
    expect(reduceIdentityDraft(three, { type: 'shirt-reuse', role: 'home' }).kits.home).toEqual({
      pattern: 'stripes',
      primary: '#d62828',
      secondary: '#FFFFFF',
      trim: '#fcbf49',
    });
    // Plain: no secondary, the trim from the third colour, else the second.
    expect(reduceIdentityDraft(three, { type: 'shirt-reuse', role: 'away' }).kits.away).toEqual({
      pattern: 'plain',
      primary: '#d62828',
      trim: '#fcbf49',
    });
    expect(reduceIdentityDraft(ENTRY, { type: 'shirt-reuse', role: 'away' }).kits.away).toEqual({
      pattern: 'plain',
      primary: '#d62828',
      trim: '#FFFFFF',
    });
    // Two colours leave a patterned shirt without trim; one colour also fills its secondary.
    expect(reduceIdentityDraft(ENTRY, { type: 'shirt-reuse', role: 'third' }).kits.third).toEqual({
      pattern: 'hoops',
      primary: '#d62828',
      secondary: '#FFFFFF',
    });
    const one = apply(ENTRY, { type: 'remove-colour', index: 1 });
    expect(reduceIdentityDraft(one, { type: 'shirt-reuse', role: 'third' }).kits.third).toEqual({
      pattern: 'hoops',
      primary: '#d62828',
      secondary: '#d62828',
    });
    expect(reduceIdentityDraft(one, { type: 'shirt-reuse', role: 'away' }).kits.away).toEqual({
      pattern: 'plain',
      primary: '#d62828',
    });
  });

  it('selects a ready-made crest in home/away colours, keeping the palette and shirts', () => {
    const own = apply(
      ENTRY,
      { type: 'crest-colour', region: 'secondary', colour: null },
      { type: 'crest-colour', region: 'accent', colour: '#fcbf49' },
    );
    CREST_PRESETS.forEach((preset, index) => {
      const next = reduceIdentityDraft(own, { type: 'crest-preset', index });
      expect(next.crest).toEqual({ ...preset, primary: '#d62828', secondary: '#ffffff' });
      expect(next.colours).toBe(ENTRY.colours);
      expect(next.kits).toBe(ENTRY.kits);
      valid(next);
    });
    expect(reduceIdentityDraft(own, { type: 'crest-preset', index: 6 })).toBe(own);
  });

  it('edits crest parts and colour regions, removing optional ones to negative space', () => {
    const next = apply(
      ENTRY,
      { type: 'crest-part', part: 'shape', value: 'diamond' },
      { type: 'crest-part', part: 'pattern', value: 'checks' },
      { type: 'crest-part', part: 'emblem', value: 'bolt' },
      { type: 'crest-colour', region: 'primary', colour: '#6A0DAD' },
      { type: 'crest-colour', region: 'accent', colour: '#f5e663' },
    );
    expect(next.crest).toEqual({
      shape: 'diamond',
      pattern: 'checks',
      emblem: 'bolt',
      primary: '#6A0DAD',
      secondary: '#ffffff',
      accent: '#f5e663',
    });
    const oneColour = apply(
      next,
      { type: 'crest-colour', region: 'secondary', colour: null },
      { type: 'crest-colour', region: 'accent', colour: null },
    );
    expect(oneColour.crest).toEqual({
      shape: 'diamond',
      pattern: 'checks',
      emblem: 'bolt',
      primary: '#6A0DAD',
    });
    valid(oneColour);
    expect(oneColour.kits).toBe(ENTRY.kits);
    expect(oneColour.colours).toBe(ENTRY.colours);
  });

  it('removes the unused secondary for plain and supplies an explicit one for a pattern', () => {
    const plain = reduceIdentityDraft(ENTRY, {
      type: 'shirt-pattern',
      role: 'home',
      pattern: 'plain',
    });
    expect(plain.kits.home).toEqual({ pattern: 'plain', primary: '#d62828' });
    expect(plain.kits.home).not.toHaveProperty('secondary');
    const hoopsToPlain = reduceIdentityDraft(ENTRY, {
      type: 'shirt-pattern',
      role: 'third',
      pattern: 'plain',
    });
    expect(hoopsToPlain.kits.third).toEqual({
      pattern: 'plain',
      primary: '#0b1f44',
      trim: '#FFFFFF',
    });
    // Plain → pattern names the representative secondary; one colour names the main one.
    const checks = reduceIdentityDraft(ENTRY, {
      type: 'shirt-pattern',
      role: 'away',
      pattern: 'checks',
    });
    expect(checks.kits.away).toEqual({
      pattern: 'checks',
      primary: '#ffffff',
      secondary: '#d62828',
      trim: '#d62828',
    });
    const one = apply(ENTRY, { type: 'remove-colour', index: 1 });
    expect(
      reduceIdentityDraft(one, { type: 'shirt-pattern', role: 'away', pattern: 'sash' }).kits.away
        .secondary,
    ).toBe('#d62828');
    // Pattern → pattern keeps the shirt's own secondary.
    expect(
      reduceIdentityDraft(ENTRY, { type: 'shirt-pattern', role: 'third', pattern: 'chevron' }).kits
        .third,
    ).toEqual({ pattern: 'chevron', primary: '#0b1f44', secondary: '#fcbf49', trim: '#FFFFFF' });
    for (const next of [plain, hoopsToPlain, checks]) valid(next);
  });

  it('edits one shirt’s regions and leaves the other roles as they were', () => {
    const next = apply(
      ENTRY,
      { type: 'shirt-colour', role: 'away', region: 'primary', colour: '#121212' },
      { type: 'shirt-colour', role: 'away', region: 'trim', colour: null },
    );
    expect(next.kits.away).toEqual({ pattern: 'plain', primary: '#121212' });
    for (const role of others('away')) expect(next.kits[role]).toBe(ENTRY.kits[role]);
    // A plain shirt has no secondary region.
    expect(
      reduceIdentityDraft(next, {
        type: 'shirt-colour',
        role: 'away',
        region: 'secondary',
        colour: '#ffffff',
      }),
    ).toBe(next);
    const trimmed = apply(
      next,
      { type: 'shirt-colour', role: 'away', region: 'trim', colour: '#f5e663' },
      { type: 'shirt-colour', role: 'home', region: 'secondary', colour: '#121212' },
    );
    expect(trimmed.kits.away).toEqual({ pattern: 'plain', primary: '#121212', trim: '#f5e663' });
    expect(trimmed.kits.home).toEqual({
      pattern: 'stripes',
      primary: '#d62828',
      secondary: '#121212',
    });
    expect(trimmed.kits.third).toBe(ENTRY.kits.third);
    valid(trimmed);
  });

  it('keeps one, two or three representative colours', () => {
    const three = apply(ENTRY, { type: 'add-colour', colour: '#fcbf49' });
    expect(reduceIdentityDraft(three, { type: 'add-colour', colour: '#121212' })).toBe(three);
    const one = apply(
      three,
      { type: 'remove-colour', index: 2 },
      { type: 'remove-colour', index: 1 },
    );
    expect(one.colours).toEqual(['#d62828']);
    expect(reduceIdentityDraft(one, { type: 'remove-colour', index: 1 })).toBe(one);
    expect(reduceIdentityDraft(one, { type: 'colour', index: 1, colour: '#121212' })).toBe(one);
    for (const value of [one, ENTRY, three]) valid(value);
  });

  it('leaves the entry identity untouched through a whole editing session', () => {
    const edited = apply(
      ENTRY,
      { type: 'colour', index: 1, colour: '#121212' },
      { type: 'crest-preset', index: 4 },
      { type: 'crest-colour', region: 'secondary', colour: null },
      { type: 'shirt-pattern', role: 'home', pattern: 'halves' },
      { type: 'shirt-reuse', role: 'away' },
      { type: 'shirt-colour', role: 'third', region: 'trim', colour: null },
    );
    expect(ENTRY).toEqual(SNAPSHOT);
    expect(edited).not.toEqual(ENTRY);
    valid(edited);
  });

  it('resets to an independent copy of the entry identity', () => {
    const edited = apply(ENTRY, { type: 'shirt-reuse', role: 'third' });
    const reset = reduceIdentityDraft(edited, { type: 'reset', entry: ENTRY });
    expect(reset).toEqual(SNAPSHOT);
    expect(reset).not.toBe(ENTRY);
    expect(reset.colours).not.toBe(ENTRY.colours);
    expect(reset.crest).not.toBe(ENTRY.crest);
    for (const role of KIT_ROLES) expect(reset.kits[role]).not.toBe(ENTRY.kits[role]);
    // Writing the copy, as a careless caller might, cannot reach the entry.
    reset.kits.home.primary = '#000000';
    reset.colours[0] = '#000000';
    expect(ENTRY).toEqual(SNAPSHOT);
    expect(cloneIdentity(ENTRY)).toEqual(SNAPSHOT);
  });

  it('refuses unknown actions at compile time', () => {
    // @ts-expect-error — not an identity draft action
    expect(() => reduceIdentityDraft(ENTRY, { type: 'shorts', colour: '#ffffff' })).toThrow();
    // A mistyped call from untyped code still cannot leave a required region empty.
    expect(
      // @ts-expect-error — the main colour cannot be removed
      reduceIdentityDraft(ENTRY, { type: 'crest-colour', region: 'primary', colour: null }),
    ).toBe(ENTRY);
    const noSecondary = { type: 'shirt-colour', role: 'home', region: 'secondary', colour: null };
    // @ts-expect-error — a patterned shirt keeps its secondary
    expect(reduceIdentityDraft(ENTRY, noSecondary)).toBe(ENTRY);
    expect(
      // @ts-expect-error — a shirt pattern is not a crest field pattern
      reduceIdentityDraft(ENTRY, { type: 'shirt-pattern', role: 'home', pattern: 'quarters' }),
    ).toBe(ENTRY);
  });

  it('keeps invalid colour text an input error that never reaches the draft', () => {
    for (const text of ['red', '#fff', '#12345g', '#1234567', 'url(#x)', '', '#d62828ff'])
      expect(colourInput(text)).toBeNull();
    expect(colourInput(' #A1b2C3 ')).toBe('#A1b2C3');
    expect(colourInput('a1b2c3')).toBe('#a1b2c3');
    const invalid: IdentityDraftAction[] = [
      { type: 'colour', index: 0, colour: 'red' },
      { type: 'add-colour', colour: '#fff' },
      { type: 'crest-colour', region: 'accent', colour: 'url(#x)' },
      { type: 'shirt-colour', role: 'home', region: 'primary', colour: '' },
      { type: 'shirt-colour', role: 'away', region: 'trim', colour: '#12345' },
      { type: 'crest-part', part: 'emblem', value: 'sponsor' as never },
    ];
    for (const action of invalid) expect(reduceIdentityDraft(ENTRY, action)).toBe(ENTRY);
  });
});

describe('three linked editor colours and random crests (→KIT-1/2/4/10/13)', () => {
  it('links each named colour without changing components or shirt patterns', () => {
    for (const role of KIT_ROLES) {
      const next = reduceIdentityDraft(ENTRY, { type: 'kit-colour', role, colour: '#123AbC' });
      const { home, away, third } = next.kits;
      expect(next.colours).toEqual([home.primary, away.primary, third.primary]);
      expect(next.kits[role].primary).toBe('#123AbC');
      for (const other of others(role))
        expect(next.kits[other].primary).toBe(ENTRY.kits[other].primary);
      expect(next.crest).toEqual({
        shape: ENTRY.crest.shape,
        pattern: ENTRY.crest.pattern,
        emblem: ENTRY.crest.emblem,
        primary: home.primary,
        secondary: away.primary,
      });
      expect(home.secondary).toBe(away.primary);
      expect(away).not.toHaveProperty('secondary');
      expect(third.secondary).toBe(home.primary);
      expect(home).not.toHaveProperty('trim');
      expect(away.trim).toBe(home.primary);
      expect(third.trim).toBe(home.primary);
      for (const kit of KIT_ROLES) expect(next.kits[kit].pattern).toBe(ENTRY.kits[kit].pattern);
      expect(ENTRY).toEqual(SNAPSHOT);
      valid(next);
    }
    expect(reduceIdentityDraft(ENTRY, { type: 'kit-colour', role: 'home', colour: 'red' })).toBe(
      ENTRY,
    );
  });

  it('prepares linked founding defaults without mutating or migrating a saved identity', () => {
    const next = linkedIdentityColours(ENTRY);
    expect(next.colours).toEqual(['#d62828', '#ffffff', '#0b1f44']);
    expect(next.crest.secondary).toBe(next.kits.away.primary);
    expect(linkedIdentityColours(next)).toEqual(next);
    expect(ENTRY).toEqual(SNAPSHOT);
    expect(reduceIdentityDraft(next, { type: 'reset', entry: ENTRY })).toEqual(SNAPSHOT);
    valid(next);
  });

  it('draws every other composition exactly once without changing colours or shirts', () => {
    const entry = linkedIdentityColours(ENTRY);
    const total = CREST_SHAPES.length * CREST_PATTERNS.length * CREST_EMBLEMS.length;
    const seen = new Set<string>();
    for (let index = 0; index < total - 1; index++) {
      const action = randomCrestAction(entry.crest, () => (index + 0.5) / (total - 1));
      const next = reduceIdentityDraft(entry, action);
      expect([next.crest.shape, next.crest.pattern, next.crest.emblem]).not.toEqual([
        entry.crest.shape,
        entry.crest.pattern,
        entry.crest.emblem,
      ]);
      seen.add(`${next.crest.shape}:${next.crest.pattern}:${next.crest.emblem}`);
      expect(next.kits).toBe(entry.kits);
      expect(next.colours).toBe(entry.colours);
      expect(next.crest.primary).toBe(entry.crest.primary);
      expect(next.crest.secondary).toBe(entry.crest.secondary);
      expect(next.crest).not.toHaveProperty('accent');
      valid(next);
    }
    expect(seen.size).toBe(total - 1);
    for (const random of [0, 1 - Number.EPSILON]) {
      const first = randomCrestAction(entry.crest, () => random);
      valid(reduceIdentityDraft(entry, first));
    }
    expect(ENTRY).toEqual(SNAPSHOT);
  });
});
