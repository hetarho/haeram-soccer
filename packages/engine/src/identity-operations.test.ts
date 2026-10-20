import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { canonical } from '../../contracts/src/index';
import type { AppearanceSide, ClubIdentity } from '../../contracts/src/identity';
import type { Founding, World } from '../../contracts/src/types';
import { identityOf } from './club-identity';
import { BANKRUPT_MESSAGE, operate } from './operations';
import { advanceDays } from './season';
import { clubOf } from './world';

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Design Town',
  color: '#223344',
  seed: 'identity-command',
  level: 'normal',
};
/** A three-colour design in mixed-case spelling, with a primary unlike the founding colour. */
const DESIGN: ClubIdentity = {
  version: 1,
  colours: ['#C8102e', '#FfFfFf', '#0b1f44'],
  crest: {
    shape: 'french',
    pattern: 'sash',
    emblem: 'crown',
    primary: '#C8102e',
    accent: '#FfFfFf',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#C8102e', secondary: '#FfFfFf', trim: '#0b1f44' },
    away: { pattern: 'plain', primary: '#FfFfFf', trim: '#C8102e' },
    third: { pattern: 'chevron', primary: '#0b1f44', secondary: '#C8102e' },
  },
};
const design = () => structuredClone(DESIGN);
const apply = (w: World, identity: unknown) =>
  operate(w, { type: 'club-identity', identity: identity as ClubIdentity });
/** The world without what may change: the own identity and colour, and the revision. */
const untouched = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    clubs: w.clubs.map((club) =>
      club.id === w.playerClub ? { ...club, identity: undefined, color: undefined } : club,
    ),
  });
/** Sporting facts: every club's identity and colour, appearances, receipts and revision left out. */
const sporting = (w: World) =>
  canonical({
    ...w,
    revision: undefined,
    receiptIds: undefined,
    clubs: w.clubs.map((club) => ({ ...club, identity: undefined, color: undefined })),
    ownMatches: w.ownMatches.map((match) => ({ ...match, appearance: undefined })),
  });
const side = (club: string, crest: AppearanceSide['crest']): AppearanceSide => ({
  club,
  crest,
  role: 'home',
  shirt: { pattern: 'plain', primary: '#ffffff' },
  goalkeeper: '#000000',
});

describe('the own-club design command (→KIT-9, KIT-13)', () => {
  it('applies a deep copied identity and primary alias', () => {
    const w = simulatedWorld(FOUNDING);
    const previous = clubOf(w).identity!;
    const before = canonical(previous);
    const identity = design();
    apply(w, identity);
    const own = clubOf(w);
    expect(own.identity).toEqual(DESIGN);
    expect(own.color).toBe('#C8102e');
    for (const copy of [own.identity, own.identity!.crest, own.identity!.kits.home])
      expect([identity, identity.crest, identity.kits.home]).not.toContain(copy);
    // Neither the caller's object nor the replaced identity is shared with the world.
    identity.kits.home.primary = '#000000';
    identity.colours[0] = '#000000';
    expect(own.identity).toEqual(DESIGN);
    expect(canonical(previous)).toBe(before);
    expect(own.identity).not.toBe(previous);
  });

  it('malformed edit leaves canonical world unchanged', () => {
    const w = simulatedWorld(FOUNDING);
    const before = canonical(w);
    const malformed: unknown[] = [
      undefined,
      { ...design(), version: 2 },
      { ...design(), colours: ['#111111', '#222222', '#333333', '#444444'] },
      { ...design(), colours: [] },
      { ...design(), colours: ['red'] },
      { ...design(), crest: { ...DESIGN.crest, primary: '#12345' } },
      { ...design(), crest: { ...DESIGN.crest, image: 'https://example.com/crest.svg' } },
      { ...design(), club: w.clubs[1].id },
      { ...design(), kits: { ...DESIGN.kits, third: undefined } },
      { ...design(), kits: { ...DESIGN.kits, home: { pattern: 'hoops', primary: '#C8102e' } } },
      {
        ...design(),
        kits: {
          ...DESIGN.kits,
          away: { pattern: 'plain', primary: '#ffffff', secondary: '#000000' },
        },
      },
    ];
    for (const identity of malformed) {
      expect(() => apply(w, identity), JSON.stringify(identity)).toThrow('구단 디자인을 확인해');
      expect(canonical(w)).toBe(before);
    }
    // Bankruptcy keeps its refusal; a world still missing designs is refused before any write.
    w.bankrupt = { year: w.year, round: w.round, day: 0 };
    expect(() => apply(w, design())).toThrow(BANKRUPT_MESSAGE);
    delete w.bankrupt;
    delete w.clubs.find((club) => club.id !== w.playerClub)!.identity;
    const missing = canonical(w);
    expect(() => apply(w, design())).toThrow('구단 디자인 정보를 갱신한 뒤');
    expect(canonical(w)).toBe(missing);
  });

  it('changes only the own identity, colour and revision', () => {
    const w = simulatedWorld(FOUNDING, { rounds: 2 });
    expect(w.ownMatches.length).toBeGreaterThan(0);
    const match = w.ownMatches.at(-1)!;
    // A recorded appearance holding the own club's current crest object itself.
    match.appearance = {
      version: 1,
      sides: [
        side(match.home, identityOf(w, match.home).crest),
        side(match.away, identityOf(w, match.away).crest),
      ],
      warnings: [],
    };
    const recorded = canonical(match.appearance);
    const rival = w.clubs.find((club) => club.id !== w.playerClub)!;
    const before = untouched(w),
      revision = w.revision;
    // A club target is no part of the command: the own club is edited, never the named one.
    operate(w, { type: 'club-identity', identity: design(), club: rival.id } as never);
    expect(clubOf(w).identity).toEqual(DESIGN);
    expect(w.revision).toBe(revision + 1);
    expect(untouched(w)).toBe(before);
    expect(canonical(match.appearance)).toBe(recorded);
  });

  it('cosmetic edits preserve sporting outcomes', () => {
    const base = simulatedWorld(FOUNDING);
    const edited = structuredClone(base);
    apply(edited, design());
    expect(clubOf(edited).color).not.toBe(clubOf(base).color);
    // Our first match is on day 7: both worlds play it with the same commands.
    for (const w of [base, edited]) advanceDays(w, 7, undefined, false);
    expect(base.ownMatches.length).toBeGreaterThan(0);
    expect(sporting(edited)).toBe(sporting(base));
    expect(edited.revision).toBe(base.revision + 1);
    expect(clubOf(edited).identity).toEqual(DESIGN);
  });
});
