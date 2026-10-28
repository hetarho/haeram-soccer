import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import {
  CREST_PALETTE,
  KIT_ROLES,
  type ClubIdentity,
  type GoalkeeperKit,
  type ShirtDesign,
} from '../../contracts/src/identity';
import type { Founding } from '../../contracts/src/types';
import { identityOf } from './club-identity';
import { colourDistance } from './identity-legacy';
import {
  figureShirtColourAt,
  insideFigureTorso,
  insideShirtMarker,
  shirtColourAt,
} from './kit-patterns';
import {
  GRASS,
  KEEPER_DISTANCE_MIN,
  TEAM_SEPARATION_MIN,
  keeperAvoiding,
  selectMatchKits,
  type KitSelection,
} from './kit-selection';
import { automaticKeeper, wornKit } from './kit-wear';
import { operate } from './operations';

/**
 * Fixed literals with their pairwise colour distances (identity-legacy `colourDistance`) and
 * contrast against GRASS, so every expected choice below follows from these numbers alone:
 * red #d62828 (grass 1.76), raspberry #c9184a, dark red #b02020 (1.29), bright red #e03a3a,
 * maroon #7f0d16 (1.21), white #ffffff (8.80), black #121212 (2.13), cream #f3e3c3, navy #0b1f44
 * (1.85), gold #fcbf49, forest #12493a (1.17), royal #1f4fd1 (1.30).
 */
const RED = '#d62828',
  WHITE = '#ffffff',
  CREAM = '#f3e3c3',
  NAVY = '#0b1f44',
  GOLD = '#fcbf49',
  FOREST = '#12493a',
  ROYAL = '#1f4fd1',
  MAROON = '#7f0d16';
const plain = (primary: string): ShirtDesign => ({ pattern: 'plain', primary });
const patterned = (
  pattern: Exclude<ShirtDesign['pattern'], 'plain'>,
  primary: string,
  secondary: string,
): ShirtDesign => ({ pattern, primary, secondary });
const club = (home: ShirtDesign, away = home, third = home): ClubIdentity => ({
  version: 1,
  colours: [home.primary],
  crest: { shape: 'shield', pattern: 'plain', emblem: 'star', primary: home.primary },
  kits: { home, away, third },
});
const CUBE = /^#(00|33|66|99|cc|ff){3}$/;
/**
 * Shirts are the saved designs of the chosen roles with their own kits' shorts and socks, and
 * automatic keepers stand apart from everything.
 */
function expectSound(selection: KitSelection, home: ClubIdentity, away: ClubIdentity) {
  expect(selection.shirts[0]).toEqual(home.kits[selection.roles[0]]);
  expect(selection.shirts[1]).toEqual(away.kits[selection.roles[1]]);
  expect(selection.shirts[0]).not.toBe(home.kits[selection.roles[0]]);
  expect(selection.shirts[1]).not.toBe(away.kits[selection.roles[1]]);
  expect(selection.kits).toEqual([
    wornKit(home, selection.roles[0]),
    wornKit(away, selection.roles[1]),
  ]);
  expect(selection.keepers).toEqual(selection.goalkeepers.map(automaticKeeper));
  expect(selection.keeperFallback).toEqual([false, false]);
  const outfield = selection.shirts.flatMap((shirt) =>
    [shirt.primary, shirt.secondary, shirt.trim].filter((c): c is string => c !== undefined),
  );
  const [first, second] = selection.goalkeepers;
  for (const keeper of selection.goalkeepers) {
    expect((CREST_PALETTE as readonly string[]).includes(keeper) || CUBE.test(keeper), keeper).toBe(
      true,
    );
    for (const colour of [...outfield, GRASS])
      expect(colourDistance(keeper, colour)).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
  }
  expect(colourDistance(first, second)).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
  expect(selection.warnings).not.toContain('goalkeepers');
}

describe('automatic kit pairing (→KIT-7)', () => {
  it('handles shared primary with distinct fields', () => {
    // Both home shirts are red halves; the other halves are white and black. The fields are far
    // apart (separation ≈ 212), so the shared primary is no clash.
    const home = club(patterned('halves', RED, '#FFFFFF')),
      away = club(patterned('halves', RED, '#121212'));
    const selection = selectMatchKits(home, away);
    expect(selection.roles).toEqual(['home', 'home']);
    expect(selection.warnings).toEqual([]);
    expectSound(selection, home, away);
    expect(selection.shirts[0].secondary).toBe('#FFFFFF');
  });

  it('warns for shared red-white palettes despite different pattern names', () => {
    // Every pairing shows the same two colours, whatever the patterns or which colour leads.
    const home = club(
      patterned('stripes', RED, WHITE),
      patterned('hoops', '#FFFFFF', '#D62828'),
      patterned('sash', RED, WHITE),
    );
    const away = club(
      patterned('checks', WHITE, RED),
      patterned('chevron', RED, WHITE),
      patterned('band', WHITE, RED),
    );
    for (const forced of [undefined, { side: 0 as const, role: 'away' as const }]) {
      const selection = selectMatchKits(home, away, forced);
      expect(selection.warnings).toContain('teams');
      expectSound(selection, home, away);
    }
  });

  it('uses the clearest pair when all clash', () => {
    // Nine red pairings, all under 150; dark red against bright red (103) is the clearest.
    const home = club(plain(RED), plain('#c9184a'), plain('#b02020'));
    const away = club(plain(RED), plain('#e03a3a'), plain('#c9184a'));
    const selection = selectMatchKits(home, away);
    expect(selection.roles).toEqual(['third', 'away']);
    expect(selection.warnings).toEqual(['teams', 'grass']);
    expectSound(selection, home, away);
  });

  it('respects a warned manual role', () => {
    const home = club(plain(WHITE), plain(RED), plain(FOREST));
    const away = club(plain(CREAM), plain(NAVY), plain(GOLD));
    // Unforced: white against navy (661) is clearest and clean.
    const recommendation = selectMatchKits(home, away);
    expect(recommendation.roles).toEqual(['home', 'away']);
    expect(recommendation.warnings).toEqual([]);
    // The owner's forest third vanishes on grass; it stays, warned, and the opponent still takes
    // its clearest answer to it (cream, 518) rather than its recommended navy (86).
    const forced = selectMatchKits(home, away, { side: 0, role: 'third' });
    expect(forced.roles).toEqual(['third', 'home']);
    expect(forced.shirts[0]).toEqual(home.kits.third);
    expect(forced.warnings).toEqual(['grass']);
    expectSound(forced, home, away);
    // Forcing the away side leaves the home side free: red (439) answers cream.
    const awayForced = selectMatchKits(home, away, { side: 1, role: 'home' });
    expect(awayForced.roles).toEqual(['away', 'home']);
    expect(awayForced.warnings).toEqual([]);
    // The unrestricted recommendation is independent of any forced preview.
    expect(selectMatchKits(home, away)).toEqual(recommendation);
  });

  it('keeps dark/green shirts visible on grass where an alternative exists', () => {
    const reds = club(plain(RED));
    const visible = club(plain(FOREST), plain(WHITE), plain(ROYAL));
    const selection = selectMatchKits(visible, reds);
    expect(selection.roles).toEqual(['away', 'home']);
    expect(selection.warnings).toEqual([]);
    expectSound(selection, visible, reds);
    // With only dark shirts the clearest saved one is used and the grass warning stays.
    const dark = club(plain(FOREST), plain(ROYAL), plain(MAROON));
    const fallback = selectMatchKits(dark, reds);
    expect(fallback.roles).toEqual(['away', 'home']);
    expect(fallback.warnings).toEqual(['grass']);
    expectSound(fallback, dark, reds);
  });

  it('breaks exact ties by home, away, third for the home side, then the away side', () => {
    expect(selectMatchKits(club(plain(WHITE)), club(plain(RED))).roles).toEqual(['home', 'home']);
    // Away and third are the same design, as are the opponent's home and away.
    const home = club(plain(CREAM), plain(WHITE), plain(WHITE));
    const away = club(plain(NAVY), plain(NAVY), plain(RED));
    expect(selectMatchKits(home, away).roles).toEqual(['away', 'home']);
  });

  it('goalkeepers differ from both sides and each other', () => {
    const cases: [ClubIdentity, ClubIdentity][] = [
      [club(plain(WHITE), plain(RED), plain(FOREST)), club(plain(CREAM), plain(NAVY), plain(GOLD))],
      [club(patterned('hoops', NAVY, GOLD)), club(patterned('checks', WHITE, RED))],
      [club({ pattern: 'stripes', primary: RED, secondary: WHITE, trim: NAVY }), club(plain(GOLD))],
    ];
    for (const [home, away] of cases) {
      const selection = selectMatchKits(home, away);
      expectSound(selection, home, away);
      expect(selectMatchKits(home, away)).toEqual(selection);
    }
  });

  it('pairing samples the figure torso', () => {
    // White-and-red checks against plain red: only the white share of what is seen separates them
    // (white–red 534.7), so the separation is that share × 534.7 / 2. The head hides the centre
    // check, leaving white on 78 of the torso's 162 sample points (128.7, a clash) where the old
    // marker disc showed it on 120 of 208 (154.2, none).
    const checks = patterned('checks', WHITE, RED);
    const share = (inside: typeof insideFigureTorso, colourAt: typeof shirtColourAt) => {
      let seen = 0,
        white = 0;
      for (let row = 0; row < 16; row++)
        for (let col = 0; col < 16; col++) {
          const x = (col + 0.5) / 16,
            y = (row + 0.5) / 16;
          if (!inside(x, y)) continue;
          seen++;
          if (colourAt(checks, x, y) === WHITE) white++;
        }
      return [white, seen];
    };
    expect(share(insideFigureTorso, figureShirtColourAt)).toEqual([78, 162]);
    expect(share(insideShirtMarker, shirtColourAt)).toEqual([120, 208]);
    expect(((78 / 162) * colourDistance(WHITE, RED)) / 2).toBeLessThan(TEAM_SEPARATION_MIN);
    expect(((120 / 208) * colourDistance(WHITE, RED)) / 2).toBeGreaterThan(TEAM_SEPARATION_MIN);
    const home = club(checks),
      away = club(plain(RED));
    const selection = selectMatchKits(home, away);
    expect(selection.warnings).toEqual(['teams']);
    expectSound(selection, home, away);
  });
});

/** A designed keeper kit with shorts, socks and gloves of its own. */
const designed = (shirt: ShirtDesign): GoalkeeperKit => ({
  shirt,
  shorts: '#121212',
  socks: shirt.primary,
  gloves: '#ffffff',
});
const withKeeper = (identity: ClubIdentity, goalkeeper: GoalkeeperKit): ClubIdentity => ({
  ...identity,
  version: 2,
  goalkeeper,
});
const YELLOW = '#f5e663',
  ORANGE = '#f77f00';
/** Every colour a shirt can show, for distance checks against an automatic keeper. */
const shown = (shirt: ShirtDesign) =>
  [shirt.primary, shirt.secondary, shirt.trim].filter((c): c is string => c !== undefined);

describe('goalkeeper kits (→KIT-8)', () => {
  it('designed keeper kept when distinguishable', () => {
    // Orange hoops on black with yellow trim, far enough from white and navy on average.
    const kit = designed({ pattern: 'hoops', primary: ORANGE, secondary: '#121212', trim: YELLOW });
    const home = club(plain(WHITE)),
      away = withKeeper(club(plain(NAVY)), kit);
    const selection = selectMatchKits(home, away);
    expect(selection.keepers[1]).toEqual(kit);
    expect(selection.keepers[1]).not.toBe(away.goalkeeper);
    expect(selection.goalkeepers[1]).toBe(ORANGE);
    expect(selection.keeperFallback).toEqual([false, false]);
    expect(selection.warnings).toEqual([]);
    // The other side's automatic keeper stands apart from the outfield, the grass and the kit.
    const auto = selection.goalkeepers[0];
    expect(selection.keepers[0]).toEqual(automaticKeeper(auto));
    for (const colour of [WHITE, NAVY, GRASS, ...shown(kit.shirt)])
      expect(colourDistance(auto, colour)).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
    // The same holds with the sides swapped.
    const swapped = selectMatchKits(away, home);
    expect(swapped.keepers[0]).toEqual(kit);
    expect(swapped.keeperFallback).toEqual([false, false]);
  });

  it('designed keeper falls back only for this fixture', () => {
    // Yellow is far from white (228) and navy (546) but close to gold (87).
    const own = withKeeper(club(plain(WHITE)), designed(plain(YELLOW)));
    const saved = JSON.stringify(own);
    const golds = club(plain(GOLD)),
      navies = club(plain(NAVY));
    for (const [home, away, side] of [
      [own, golds, 0],
      [golds, own, 1],
    ] as const) {
      const selection = selectMatchKits(home, away);
      expect(selection.keeperFallback[side]).toBe(true);
      expect(selection.keeperFallback[1 - side]).toBe(false);
      const auto = selection.goalkeepers[side];
      expect(selection.keepers[side]).toEqual(automaticKeeper(auto));
      for (const colour of [WHITE, GOLD, GRASS, selection.goalkeepers[1 - side]])
        expect(colourDistance(auto, colour)).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
      expect(selection.warnings).not.toContain('goalkeepers');
    }
    // Against navy the same saved kit is worn; the fallback never edited it.
    const kept = selectMatchKits(own, navies);
    expect(kept.keepers[0]).toEqual(own.goalkeeper);
    expect(kept.keeperFallback).toEqual([false, false]);
    expect(JSON.stringify(own)).toBe(saved);
    // Two designed kits that cannot be told apart: the away one gives way.
    const rival = withKeeper(club(plain(NAVY)), designed(plain(GOLD)));
    const both = selectMatchKits(own, rival);
    expect(both.keepers[0]).toEqual(own.goalkeeper);
    expect(both.keeperFallback).toEqual([false, true]);
    expect(colourDistance(both.goalkeepers[1], YELLOW)).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
  });

  it('automatic colours avoid a designed keeper', () => {
    const home = club(plain(WHITE)),
      away = club(plain(NAVY));
    const auto = selectMatchKits(home, away).goalkeepers;
    // The away club designs exactly the colour the home keeper would otherwise get.
    const rival = withKeeper(away, designed(plain(auto[0])));
    const selection = selectMatchKits(home, rival);
    expect(selection.keepers[1]).toEqual(rival.goalkeeper);
    expect(selection.goalkeepers[0]).not.toBe(auto[0]);
    expect(colourDistance(selection.goalkeepers[0], auto[0])).toBeGreaterThanOrEqual(
      KEEPER_DISTANCE_MIN,
    );
    expect(selection.keepers[0]).toEqual(automaticKeeper(selection.goalkeepers[0]));
    expect(selection.keeperFallback).toEqual([false, false]);
  });

  it("keeper draft avoids the club's three kits", () => {
    const kits = [
      patterned('stripes', RED, WHITE),
      { pattern: 'plain', primary: WHITE, trim: NAVY },
      patterned('sash', GOLD, FOREST),
    ] satisfies ShirtDesign[];
    const colour = keeperAvoiding(kits);
    expect((CREST_PALETTE as readonly string[]).includes(colour) || CUBE.test(colour)).toBe(true);
    for (const avoided of [...kits.flatMap(shown), GRASS])
      expect(colourDistance(colour, avoided), avoided).toBeGreaterThanOrEqual(KEEPER_DISTANCE_MIN);
    expect(keeperAvoiding(kits)).toBe(colour);
  });
});

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Kit Rovers',
  color: '#3A7bC2',
  seed: 'kits',
  level: 'normal',
};
const OWN: ClubIdentity = {
  version: 1,
  colours: ['#3A7bC2', '#F5E663'],
  crest: { shape: 'round', pattern: 'plain', emblem: 'ball', primary: '#3A7bC2' },
  kits: {
    home: { pattern: 'stripes', primary: '#3A7bC2', secondary: '#F5E663' },
    away: { pattern: 'plain', primary: '#FFFFFF', trim: '#3A7bC2' },
    third: { pattern: 'sash', primary: '#121212', secondary: '#F5E663', trim: '#FFFFFF' },
  },
};

describe('selection over saved identities (→KIT-6, KIT-13)', () => {
  it('forces the own club on both sides and leaves every saved identity unchanged', () => {
    const w = simulatedWorld(FOUNDING);
    const own = structuredClone(OWN);
    const rival = identityOf(w, w.clubs.find((club) => club.id !== w.playerClub)!.id);
    const before = [JSON.stringify(own), JSON.stringify(rival)];
    for (const role of KIT_ROLES) {
      const asHome = selectMatchKits(own, rival, { side: 0, role });
      const asAway = selectMatchKits(rival, own, { side: 1, role });
      expect(asHome.roles[0]).toBe(role);
      expect(asAway.roles[1]).toBe(role);
      expect(asHome.shirts[0]).toEqual(OWN.kits[role]);
      expect(asAway.shirts[1]).toEqual(OWN.kits[role]);
      expectSound(asHome, own, rival);
      expectSound(asAway, rival, own);
      asHome.shirts[0].primary = '#000000';
      asAway.shirts[1].pattern = 'checks';
    }
    expectSound(selectMatchKits(own, rival), own, rival);
    expectSound(selectMatchKits(rival, own), rival, own);
    expect([JSON.stringify(own), JSON.stringify(rival)]).toEqual(before);
  });

  it('selection is unchanged by unrelated revision/read commands', () => {
    const w = simulatedWorld(FOUNDING);
    const rival = w.clubs.find((club) => club.id !== w.playerClub && !club.representative)!.id;
    const pick = () => selectMatchKits(identityOf(w, w.playerClub), identityOf(w, rival));
    const before = pick();
    operate(w, { type: 'read-inbox' });
    w.revision += 7;
    identityOf(w, rival);
    expect(pick()).toEqual(before);
    expect(selectMatchKits(identityOf(w, rival), identityOf(w, w.playerClub))).toEqual(
      selectMatchKits(identityOf(w, rival), identityOf(w, w.playerClub)),
    );
  });
});
