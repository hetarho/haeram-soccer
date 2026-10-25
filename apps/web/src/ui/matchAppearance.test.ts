import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { canonical } from '../../../../packages/contracts/src/index';
import type { ClubIdentity } from '../../../../packages/contracts/src/identity';
import type { PlayerMotion, PlayerMotionState } from '../../../../packages/contracts/src/types';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { createWorld, simulateMatch } from '../../../../packages/engine/src/index';
import { operate } from '../../../../packages/engine/src/operations';
import {
  keepersBySample,
  matchLook,
  PLACEHOLDER_CREST,
  UNRECORDED_KIT,
  UNRECORDED_LOOK,
  type PresentedSample,
} from './matchAppearance';

const FOUNDING = {
  country: 'ENG',
  name: 'Look Town',
  color: '#223344',
  seed: 'match-look',
  level: 'normal',
} as const;
/** A founding after one round: its own match settled with a recorded appearance. */
const played = () => {
  const w = simulatedWorld(FOUNDING, { rounds: 1 });
  const record = w.ownMatches.at(-1)!;
  expect(record.appearance).toBeDefined();
  return { w, record };
};

describe('recorded match appearance (→KIT-12, SAVE-22)', () => {
  it('resolves the recorded appearance itself, with no current-world fallback', () => {
    const { w, record } = played();
    const look = matchLook(record);
    expect(look.recorded).toBe(true);
    record.appearance!.sides.forEach((side, i) => {
      expect(look.sides[i].crest).toBe(side.crest);
      expect(look.sides[i].shirt).toBe(side.shirt);
      expect(look.sides[i].keeper).toEqual({ pattern: 'plain', primary: side.goalkeeper });
      expect(look.sides[i].role).toBe(side.role);
    });
    expect(look.warnings).toBe(record.appearance!.warnings);
    const before = canonical(look);
    // The owner redesigns the club after the match: crest and every shirt change.
    const own = identityOf(w, w.playerClub);
    const edited: ClubIdentity = {
      ...own,
      colours: ['#ff00ff', '#00e5ff'],
      crest: { ...own.crest, primary: '#ff00ff', secondary: '#00e5ff' },
      kits: {
        home: { pattern: 'checks', primary: '#ff00ff', secondary: '#00e5ff' },
        away: { pattern: 'hoops', primary: '#00e5ff', secondary: '#ff00ff' },
        third: { pattern: 'plain', primary: '#ffd400' },
      },
    };
    operate(w, { type: 'club-identity', identity: edited });
    const after = matchLook(w.ownMatches.find((m) => m.id === record.id)!);
    expect(canonical(after)).toBe(before);
    const side = record.home === w.playerClub ? 0 : 1;
    expect(after.sides[side].shirt).not.toEqual(
      identityOf(w, w.playerClub).kits[after.sides[side].role!],
    );
    expect(after.sides[side].crest).not.toEqual(identityOf(w, w.playerClub).crest);
  });

  it('never corrects a snapshot that names other clubs from anything current', () => {
    const { record } = played();
    const swapped = { ...record, home: record.away, away: record.home };
    expect(matchLook(swapped)).toBe(UNRECORDED_LOOK);
  });

  it('keeps a record without appearance explicitly unrecorded, with neutral stand-ins', () => {
    const { w, record } = played();
    const legacy = { ...record };
    delete legacy.appearance;
    const look = matchLook(legacy);
    expect(look).toBe(UNRECORDED_LOOK);
    expect(look.recorded).toBe(false);
    expect(UNRECORDED_KIT).toBe('유니폼 미기록');
    expect(look.sides.map((side) => side.crest)).toEqual([PLACEHOLDER_CREST, PLACEHOLDER_CREST]);
    expect(look.sides.map((side) => side.role)).toEqual([undefined, undefined]);
    // Neither side borrows a club's current crest or shirt for the unrecorded match.
    for (const id of [record.home, record.away]) {
      const current = identityOf(w, id);
      expect(look.sides.map((side) => side.crest)).not.toContainEqual(current.crest);
      for (const side of look.sides)
        expect(Object.values(current.kits)).not.toContainEqual(side.shirt);
    }
    expect(Object.isFrozen(look.sides[0].shirt)).toBe(true);
    expect(Object.isFrozen(PLACEHOLDER_CREST)).toBe(true);
  });
});

const motion = (id: string, state: PlayerMotionState = 'shape'): PlayerMotion => ({
  id,
  position: [50, 50],
  velocity: [0, 0],
  state,
  intent: [50, 50],
});
/** Whole matchday rosters: starters, then the bench with a second home keeper. */
const SQUADS = [
  [
    { id: 'h-gk', position: 'GK' },
    { id: 'h-cb', position: 'CB' },
    { id: 'h-gk2', position: 'GK' },
  ],
  [
    { id: 'a-gk', position: 'GK' },
    { id: 'a-st', position: 'ST' },
    { id: 'a-cm', position: 'CM' },
  ],
] as const;

describe('the actual keeper in each sample (→KIT-8)', () => {
  it('follows the engine keeper, the minute and the roster, never a slot', () => {
    const samples: PresentedSample[] = [
      {
        frame: 0,
        players: [[motion('h-cb'), motion('h-gk', 'keeper')], [motion('a-gk', 'keeper')]],
      },
      // The keeper has the ball: the minute's keeper still is.
      {
        frame: 0,
        players: [[motion('h-gk', 'carry'), motion('h-cb')], [motion('a-gk', 'keeper')]],
      },
      // A substitute keeper from the bench; an outfield player in goal after a red card.
      {
        frame: 1,
        players: [
          [motion('h-cb'), motion('h-gk2', 'keeper')],
          [motion('a-st'), motion('a-cm', 'keeper')],
        ],
      },
      // No keeper state this minute: the last keeper while still on the pitch, so the outfield
      // player in goal keeps the keeper colour.
      {
        frame: 2,
        players: [
          [motion('h-gk2', 'carry'), motion('h-cb')],
          [motion('a-st'), motion('a-cm')],
        ],
      },
      // Both have left the pitch and no goalkeeper is on: nobody is drawn as keeper.
      { frame: 2, players: [[motion('h-cb')], [motion('a-st')]] },
      // The minute's earlier keeper has gone off: the roster's goalkeeper on the pitch is.
      { frame: 3, players: [[motion('h-gk', 'keeper')], [motion('a-gk', 'keeper')]] },
      {
        frame: 3,
        players: [[motion('h-cb', 'carry'), motion('h-gk2')], [motion('a-gk', 'keeper')]],
      },
      // An archived minute without players carries no keeper on.
      { frame: 4 },
      { frame: 5, players: [[motion('h-cb')], [motion('a-st'), motion('a-cm')]] },
    ];
    expect(keepersBySample(samples, SQUADS)).toEqual([
      ['h-gk', 'a-gk'],
      ['h-gk', 'a-gk'],
      ['h-gk2', 'a-cm'],
      ['h-gk2', 'a-cm'],
      [undefined, undefined],
      ['h-gk', 'a-gk'],
      ['h-gk2', 'a-gk'],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });

  it('finds a keeper on the pitch in every sample of a real observed match', () => {
    const w = createWorld({ ...FOUNDING, seed: 'match-look-keepers' });
    const playback = simulateMatch(
      w,
      w.fixtures.find((f) => f.home === w.playerClub)!,
      true,
      true,
    );
    const samples: PresentedSample[] = playback.frames.flatMap((frame, i) =>
      frame.motion?.length
        ? frame.motion.map((m) => ({ frame: i, players: m.players }))
        : [{ frame: i, players: frame.players }],
    );
    const keepers = keepersBySample(samples, playback.squads);
    expect(keepers).toHaveLength(samples.length);
    // On the released model this 1950 match (no substitutes) loses the away keeper to an injury
    // at 85′: until the stoppage puts an outfield player in goal (`coverGoal`), nobody keeps it,
    // and the sample shows no keeper rather than an invented one.
    const keeperOut = (playback.record.incidents ?? []).filter(
      (x) =>
        x.kind !== 'yellow' &&
        playback.squads[x.side]!.some((p) => p.id === x.player && p.position === 'GK'),
    );
    let empty = 0;
    samples.forEach((sample, i) =>
      ([0, 1] as const).forEach((side) => {
        const players = sample.players![side];
        const engineKeeper = players.find((m) => m.state === 'keeper')?.id;
        if (keepers[i]![side] === undefined) {
          empty++;
          expect(engineKeeper).toBeUndefined();
          const minute = Number(playback.frames[sample.frame]!.label.match(/\d+/)![0]);
          expect(keeperOut.some((x) => x.side === side && x.minute <= minute + 1)).toBe(true);
          return;
        }
        expect(players.map((m) => m.id)).toContain(keepers[i]![side]);
        if (engineKeeper) expect(keepers[i]![side]).toBe(engineKeeper);
      }),
    );
    expect(empty).toBeLessThanOrEqual(keeperOut.length * 3);
  });
});
