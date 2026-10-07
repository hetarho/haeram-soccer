import { describe, expect, it } from 'vitest';
import { validateWorld } from '../../contracts/src/schema';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  activePlayers,
  clubOf,
  createWorld,
  LINEUP_ROLES,
  lineupPreset,
  lineupSummary,
  nextOwnFixture,
  overall,
  rating,
  setLineup,
  simulateMatch,
  startingSquad,
} from './index';

const input = {
  country: 'ENG' as const,
  name: 'Preparation FC',
  color: '#28654b',
  seed: 'real-lineup-decisions',
  difficulty: 1,
};

describe('pre-match decisions', () => {
  it('uses the chosen role-safe XI for actual actors and match records', () => {
    const w = createWorld(input),
      automatic = startingSquad(w, clubOf(w)),
      ids = automatic.map((player) => player.id);
    const replacement = activePlayers(w).find(
      (player) => player.role === 'FWD' && !ids.includes(player.id),
    )!;
    ids[8] = replacement.id;
    setLineup(w, ids);
    const match = simulateMatch(w, nextOwnFixture(w)!, false, true),
      side = match.record.home === w.playerClub ? 0 : 1;
    expect(match.squads[side].map((player) => player.id)).toEqual(ids);
    expect(
      match.record.players
        .filter((player) => w.players.some((own) => own.id === player.id))
        .map((player) => player.id),
    ).toEqual(ids);
    expect(startingSquad(w, clubOf(w)).map((player) => player.role)).toEqual(LINEUP_ROLES);
    expect(rating(w, clubOf(w))).toBe(lineupSummary(match.squads[side]).strength);
  });

  it('rejects duplicate, unknown, inactive and wrong-position selections before mutation', () => {
    const w = createWorld(input),
      ids = startingSquad(w, clubOf(w)).map((player) => player.id),
      originalEvents = w.events.length;
    expect(() => setLineup(w, ids.slice(0, 10))).toThrow();
    expect(() => setLineup(w, [ids[1], ...ids.slice(1)])).toThrow();
    expect(() => setLineup(w, ['unknown', ...ids.slice(1)])).toThrow();
    const wrongRole = [...ids];
    [wrongRole[0], wrongRole[1]] = [wrongRole[1], wrongRole[0]];
    expect(() => setLineup(w, wrongRole)).toThrow();
    w.players.find((player) => player.id === ids[8])!.status = 'sold';
    expect(() => setLineup(w, ids)).toThrow();
    expect(w.lineup).toBeUndefined();
    expect(w.events).toHaveLength(originalEvents);
  });

  it('automatically replaces unavailable saved starters without moving roles or duplicating players', () => {
    const w = createWorld(input),
      ids = lineupPreset(w, 'strongest');
    setLineup(w, ids);
    w.players.find((player) => player.id === ids[8])!.status = 'retired';
    const starters = startingSquad(w, clubOf(w));
    expect(starters).toHaveLength(11);
    expect(new Set(starters.map((player) => player.id)).size).toBe(11);
    expect(starters.every((player) => player.status === 'active')).toBe(true);
    expect(starters[8].id).not.toBe(ids[8]);
    expect(starters.map((player) => player.role)).toEqual(LINEUP_ROLES);
    expect(validateWorld(w).lineup).toEqual(ids);
    setLineup(w, null);
    expect(w.lineup).toBeUndefined();
  });

  it('offers a real fatigue-quality tradeoff instead of identical presets', () => {
    const w = createWorld(input),
      gks = activePlayers(w).filter((player) => player.role === 'GK');
    gks[0].keeper = 95;
    gks[0].fatigue = 60;
    gks[1].keeper = 65;
    gks[1].fatigue = 0;
    const strongest = lineupPreset(w, 'strongest'),
      rest = lineupPreset(w, 'rest');
    expect(strongest[0]).toBe(gks[0].id);
    expect(rest[0]).toBe(gks[1].id);
    const select = (ids: string[]) =>
      ids.map((id) => w.players.find((player) => player.id === id)!);
    expect(lineupSummary(select(rest)).fatigue).toBeLessThan(
      lineupSummary(select(strongest)).fatigue,
    );
    expect(strongest).toHaveLength(11);
    expect(rest).toHaveLength(11);
  });

  it('changes actual chances through selected players’ ability rather than visual-only substitutions', () => {
    const w = createWorld(input),
      forwards = activePlayers(w).filter((player) => player.role === 'FWD');
    forwards.forEach((player, i) => {
      player.attack = i === 3 ? 5 : 95;
      player.passing = i === 3 ? 5 : 95;
      player.defense = i === 3 ? 5 : 95;
      player.stamina = i === 3 ? 5 : 95;
    });
    const good = lineupPreset(w, 'strongest'),
      weaker = [...good];
    weaker[8] = forwards[3].id;
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
