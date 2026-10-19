import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import { ATTRIBUTES } from '../../contracts/src/player';
import { lineOf } from './player';
import {
  activePlayers,
  clubOf,
  createWorld,
  formationOf,
  slotOvr,
  lineupPreset,
  lineupSummary,
  nextOwnFixture,
  overall,
  rating,
  setLineup,
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

describe('pre-match decisions', () => {
  it('uses the chosen XI for actual actors and match records', () => {
    const w = createWorld(input),
      automatic = startingSquad(w, clubOf(w)),
      ids = automatic.map((player) => player.id);
    const replacement = activePlayers(w).find((player) => !ids.includes(player.id))!;
    ids[8] = replacement.id;
    setLineup(w, ids);
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
    expect(startingSquad(w, clubOf(w)).map((player) => player.id)).toEqual(ids);
    expect(rating(w, clubOf(w))).toBe(
      lineupSummary(match.squads[side].slice(0, 11), w.tactic).strength,
    );
  });

  it('rejects duplicate, unknown and inactive selections before mutation', () => {
    const w = createWorld(input),
      ids = startingSquad(w, clubOf(w)).map((player) => player.id),
      originalEvents = w.events.length;
    expect(() => setLineup(w, ids.slice(0, 10))).toThrow();
    expect(() => setLineup(w, [ids[1], ...ids.slice(1)])).toThrow();
    expect(() => setLineup(w, ['unknown', ...ids.slice(1)])).toThrow();
    w.players.find((player) => player.id === ids[8])!.status = 'sold';
    expect(() => setLineup(w, ids)).toThrow();
    expect(w.lineup).toBeUndefined();
    expect(w.events).toHaveLength(originalEvents);
  });

  it('manual slot plays at level', () => {
    const w = createWorld(input),
      ids = startingSquad(w, clubOf(w)).map((player) => player.id);
    // Anyone may play any slot (→CLUB-6): the keeper in the first defender's place.
    const swapped = [...ids];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    setLineup(w, swapped);
    expect(w.lineup).toEqual(swapped);
    const keeper = w.players.find((player) => player.id === ids[0])!,
      slot = formationOf(w.tactic)[1]!;
    expect(keeper.positions[slot.position]).toBeUndefined();
    // 미숙 there: 60% of his OVR at the slot's position and role.
    const before = slotOvr(keeper, slot);
    keeper.positions = { ...keeper.positions, [slot.position]: 1 };
    expect(slotOvr(keeper, slot)).toBeCloseTo((before / 0.6) * 0.8, 6);
  });

  it('automatically replaces unavailable saved starters without moving slots or duplicating players', () => {
    const w = createWorld(input),
      ids = lineupPreset(w, 'strongest');
    setLineup(w, ids);
    w.players.find((player) => player.id === ids[8])!.status = 'retired';
    const starters = startingSquad(w, clubOf(w));
    expect(starters).toHaveLength(11);
    expect(new Set(starters.map((player) => player.id)).size).toBe(11);
    expect(starters.every((player) => player.status === 'active')).toBe(true);
    expect(starters[8].id).not.toBe(ids[8]);
    expect(starters.filter((_, i) => i !== 8).map((player) => player.id)).toEqual(
      ids.filter((_, i) => i !== 8),
    );
    expect(validateWorld(w).lineup).toEqual(ids);
    setLineup(w, null);
    expect(w.lineup).toBeUndefined();
  });

  it('offers a real fatigue-quality tradeoff instead of identical presets', () => {
    const w = createWorld(input),
      gks = activePlayers(w).filter((player) => player.position === 'GK');
    for (const a of ATTRIBUTES) {
      gks[0].attrs[a] = 95;
      gks[1].attrs[a] = 65;
    }
    gks[0].fatigue = 60;
    gks[1].fatigue = 0;
    const strongest = lineupPreset(w, 'strongest'),
      rest = lineupPreset(w, 'rest');
    expect(strongest[0]).toBe(gks[0].id);
    expect(rest[0]).toBe(gks[1].id);
    const select = (ids: string[]) =>
      ids.map((id) => w.players.find((player) => player.id === id)!);
    expect(lineupSummary(select(rest), w.tactic).fatigue).toBeLessThan(
      lineupSummary(select(strongest), w.tactic).fatigue,
    );
    expect(strongest).toHaveLength(11);
    expect(rest).toHaveLength(11);
  });

  it('changes actual chances through selected players’ ability rather than visual-only substitutions', () => {
    const w = createWorld(input),
      forwards = activePlayers(w).filter((player) => lineOf(player.position) === 'FW');
    forwards.forEach((player, i) => {
      for (const a of ATTRIBUTES) player.attrs[a] = i === 3 ? 5 : 95;
    });
    const good = lineupPreset(w, 'strongest'),
      weaker = [...good],
      forward = formationOf(w.tactic).findIndex((slot) => lineOf(slot.position) === 'FW');
    weaker[forward] = forwards[3].id;
    const fixture = nextOwnFixture(w)!;
    const side = fixture.home === w.playerClub ? 0 : 1;
    const totalTargets = (ids: string[]) => {
      setLineup(w, ids);
      return Array.from(
        { length: 30 },
        (_, i) =>
          simulateMatch(w, { ...fixture, id: `${fixture.id}:comparison:${i}` }).record.metrics[
            side
          ][5],
      ).reduce((sum, targets) => sum + targets, 0);
    };
    expect(totalTargets(good)).toBeGreaterThan(totalTargets(weaker));
    expect(overall(forwards[0])).toBeGreaterThan(overall(forwards[3]));
  });

  it('round-trips manual preparation and accepts older saves without preferences', async () => {
    const w = createWorld(input),
      ids = lineupPreset(w, 'strongest');
    setLineup(w, ids);
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(restored.lineup).toEqual(ids);
    expect(startingSquad(restored, clubOf(restored)).map((player) => player.id)).toEqual(ids);
    delete w.lineup;
    expect(validateWorld(w).lineup).toBeUndefined();
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
