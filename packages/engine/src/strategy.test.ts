import { describe, expect, it } from 'vitest';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf } from './player';
import {
  activePlayers,
  clubOf,
  createWorld,
  formationOf,
  slotOvr,
  lineupSummary,
  nextOwnFixture,
  rating,
  simulateMatch,
  startingSquad,
  tacticalProfile,
} from './index';

const input = {
  country: 'ENG' as const,
  name: 'Preparation FC',
  color: '#28654b',
  seed: 'real-lineup-decisions',
  level: 'normal' as const,
};

describe('the manager picks the XI (→CLUB-6)', () => {
  it('plays his automatic XI as the match actors and records', () => {
    const w = createWorld(input),
      ids = startingSquad(w, clubOf(w)).map((player) => player.id);
    const match = simulateMatch(w, nextOwnFixture(w)!, false, true),
      side = match.record.home === w.playerClub ? 0 : 1;
    // The matchday roster is the XI in slot order, then the bench; the record's own lines open
    // with the same XI.
    expect(match.squads[side].slice(0, 11).map((player) => player.id)).toEqual(ids);
    expect(
      match.record.players
        .filter((player) => w.players.some((own) => own.id === player.id))
        .slice(0, 11)
        .map((player) => player.id),
    ).toEqual(ids);
    expect(rating(w, clubOf(w))).toBe(
      lineupSummary(match.squads[side].slice(0, 11), w.tactic).strength,
    );
  });

  it('plays a player out of position at his level there', () => {
    const w = createWorld(input),
      ids = startingSquad(w, clubOf(w)).map((player) => player.id);
    // Anyone may play any slot (→CLUB-6): the keeper in the first defender's place.
    const keeper = w.players.find((player) => player.id === ids[0])!,
      slot = formationOf(w.tactic)[1]!;
    expect(keeper.positions[slot.position]).toBeUndefined();
    // 미숙 there: 60% of his OVR at the slot's position and role.
    const before = slotOvr(keeper, slot);
    keeper.positions = { ...keeper.positions, [slot.position]: 1 };
    expect(slotOvr(keeper, slot)).toBeCloseTo((before / 0.6) * 0.8, 6);
  });

  it('changes actual chances through the forwards’ ability', () => {
    const fixtureOf = (w: ReturnType<typeof createWorld>) => nextOwnFixture(w)!;
    const totalTargets = (level: number) => {
      const w = createWorld(input);
      for (const player of activePlayers(w).filter((p) => lineOf(p.position) === 'FW'))
        for (const a of ATTRIBUTES) player.attrs[a] = level;
      const fixture = fixtureOf(w),
        side = fixture.home === w.playerClub ? 0 : 1;
      return Array.from(
        { length: 30 },
        (_, i) =>
          simulateMatch(w, { ...fixture, id: `${fixture.id}:comparison:${i}` }).record.metrics[
            side
          ][5],
      ).reduce((sum, targets) => sum + targets, 0);
    };
    expect(totalTargets(95)).toBeGreaterThan(totalTargets(5));
  });
});

describe('the tactical profile reads the named attributes (→MATCH-8, MATCH-9)', () => {
  it('fit reads attributes', () => {
    const w = createWorld(input);
    const lines = (tactic: Parameters<typeof formationOf>[0]) => {
      const xi = startingSquad(w, clubOf(w)).map((p) => structuredClone(p));
      return {
        xi,
        line: (name: string) =>
          xi.filter((_, i) => lineOf(formationOf(tactic)[i]!.position) === name),
      };
    };
    const fit = (
      tactic: Parameters<typeof formationOf>[0],
      change: (l: ReturnType<typeof lines>) => void,
    ) => {
      const plain = lines(tactic),
        changed = lines(tactic);
      change(changed);
      return [tacticalProfile(plain.xi, tactic), tacticalProfile(changed.xi, tactic)] as const;
    };
    // Possession plays through the midfielders' 시야; balanced does not read it.
    const [before, after] = fit('possession', (l) =>
      l.line('MF').forEach((p) => (p.attrs.vision = 95)));
    expect(after.fit).toBeGreaterThan(before.fit);
    expect(after.possession).toBeGreaterThan(before.possession);
    const [steady, same] = fit('balanced', (l) =>
      l.line('MF').forEach((p) => (p.attrs.vision = 95)));
    expect(same.fit).toBe(steady.fit);
    // A counter runs on the forwards' 속도 and sits on the defenders' 위치선정.
    const [slow, quick] = fit('counter', (l) => l.line('FW').forEach((p) => (p.attrs.pace = 95)));
    expect(quick.fit).toBeGreaterThan(slow.fit);
    expect(quick.shot).toBeGreaterThan(slow.shot);
    // Defenders' 공중볼 suppresses the opponent's chances.
    const [low, high] = fit('balanced', (l) => l.line('DF').forEach((p) => (p.attrs.heading = 95)));
    expect(high.defenseQuality).toBeGreaterThan(low.defenseQuality);
    expect(high.defense).toBeGreaterThan(low.defense);
  });
});
