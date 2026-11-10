import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { demoFixture } from '../core/squads.ts';
import { lineOf, type Vec } from '../core/types.ts';
import { dist } from '../core/vec.ts';
import { castOpponentNear, castReceiver, ruleWeight, type CastRule } from './cast.ts';
import { initialState, phaseAt, spot, type ScriptState } from './state.ts';

const fixture = demoFixture();

const openPlay = (seed: string, holder: number, ball: Vec): ScriptState => {
  const state = initialState(seed, fixture);
  state.pending = undefined;
  state.holder = holder;
  state.ball = ball;
  state.phase = phaseAt(0, ball);
  return state;
};

describe('cast', () => {
  it('role rules beat position rules beat line rules', () => {
    // H3: LB, invertedFullBack, line DF.
    const p = fixture.players[1];
    const line: CastRule = { line: 'DF', w: 1 };
    const position: CastRule = { position: 'LB', w: 2 };
    const role: CastRule = { role: 'invertedFullBack', w: 3 };
    expect(ruleWeight(p, [line, position, role])).toBe(3);
    expect(ruleWeight(p, [role, position, line])).toBe(3);
    expect(ruleWeight(p, [line, position])).toBe(2);
    expect(ruleWeight(p, [line])).toBe(1);
    expect(
      ruleWeight(p, [
        { position: 'CB', w: 5 },
        { role: 'anchor', w: 4 },
      ]),
    ).toBe(0);
  });

  it('the holder is never cast', () => {
    // Index 2 (CB, ballPlayingDefender) holds; index 3 is the only other CB.
    const state = openPlay('cast-holder', 2, [30, 30]);
    for (let i = 0; i < 40; i++) expect(castReceiver(state, [{ position: 'CB', w: 1 }])).toBe(3);
    // The holder alone matches: nobody is cast and nothing is drawn.
    const lone = openPlay('cast-lone', 2, [30, 30]);
    expect(castReceiver(lone, [{ role: 'ballPlayingDefender', w: 1 }])).toBeUndefined();
    expect(lone.rng.next()).toBe(createRng('cast-lone').next());
  });

  it('castOpponentNear takes the nearest nominal defender and skips the keeper unless asked', () => {
    const state = openPlay('cast-near', 9, [95, 34]);
    const keeper = 11;
    const point = spot(state, keeper);
    const outfield = fixture.teams[1].players.filter((p) => p.slot !== 0).map((p) => p.index);
    const nearest = outfield.reduce((a, b) =>
      dist(spot(state, b), point) < dist(spot(state, a), point) ? b : a,
    );
    expect(castOpponentNear(state, point)).toBe(nearest);
    expect(castOpponentNear(state, point, { keeper: true })).toBe(keeper);
    const forward = castOpponentNear(state, point, { lines: ['FW'] });
    expect(lineOf(fixture.players[forward].position)).toBe('FW');
    expect(fixture.players[forward].team).toBe(1);
  });
});
