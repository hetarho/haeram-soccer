import { describe, expect, it } from 'vitest';
import { PROTO_CONFIG } from '../core/config.ts';
import { clampToPitch, inPitch, toAttack } from '../core/pitch.ts';
import { createRng } from '../core/rng.ts';
import { demoFixture } from '../core/squads.ts';
import { lineOf, type Vec } from '../core/types.ts';
import { add, dist, norm, scale, sub } from '../core/vec.ts';
import {
  castOpponentNear,
  castReceiver,
  feetPoint,
  ruleWeight,
  stridePoint,
  type CastRule,
} from './cast.ts';
import { attackSpot, initialState, phaseAt, spot, type ScriptState } from './state.ts';

const fixture = demoFixture();

const openPlay = (seed: string, holder: number, ball: Vec): ScriptState => {
  const state = initialState(seed, fixture);
  state.pending = undefined;
  state.holder = holder;
  state.ball = ball;
  state.phase = phaseAt(0, ball);
  return state;
};

/** H10 (index 9), the home side's central forward; his nominal spot moves with the ball. */
const RECEIVER = 9;

/**
 * Open play with `holder` on the ball 2 m beside the receiver's nominal spot: the spot follows the
 * ball, so the ball is placed beside it a few times until it settles.
 */
const besideReceiver = (seed: string, holder: number, receiver: number): ScriptState => {
  const state = openPlay(seed, holder, [45, 30]);
  for (let i = 0; i < 6; i++) {
    const s = spot(state, receiver);
    state.ball = [s[0] + 2, s[1]];
    state.phase = phaseAt(0, state.ball);
  }
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

  it('feetPoint keeps grammar.minPass from the ball and still draws twice', () => {
    const state = besideReceiver('feet-near', 6, RECEIVER);
    expect(Math.abs(dist(state.ball, spot(state, RECEIVER)) - 2)).toBeLessThan(0.5);
    const to = feetPoint(state, RECEIVER);
    expect(inPitch(to, PROTO_CONFIG.margin + 0.5)).toBe(true);
    expect(dist(state.ball, to)).toBeGreaterThanOrEqual(PROTO_CONFIG.grammar.minPass - 1e-9);
    const twin = createRng('feet-near');
    twin.next();
    twin.next();
    expect(state.rng.next()).toBe(twin.next());
  });

  it('stridePoint keeps grammar.minPass from the ball and draws nothing', () => {
    const state = besideReceiver('stride-near', 6, RECEIVER);
    const to = stridePoint(state, RECEIVER, 0);
    expect(inPitch(to, PROTO_CONFIG.margin + 0.5)).toBe(true);
    expect(dist(state.ball, to)).toBeGreaterThanOrEqual(PROTO_CONFIG.grammar.minPass - 1e-9);
    expect(state.rng.next()).toBe(createRng('stride-near').next());
  });

  it('a point already far enough is returned as before', () => {
    const state = openPlay('far-enough', 6, [30, 20]);
    const s = spot(state, RECEIVER);
    expect(dist(state.ball, s)).toBeGreaterThan(PROTO_CONFIG.grammar.minPass + 6);
    const twin = createRng('far-enough');
    const shown = add(s, scale(norm(sub(state.ball, s)), PROTO_CONFIG.grammar.showFor));
    const jitter = PROTO_CONFIG.grammar.jitter;
    const jx = twin.range(-jitter, jitter);
    const jy = twin.range(-jitter, jitter);
    expect(feetPoint(state, RECEIVER)).toEqual(
      clampToPitch([shown[0] + jx, shown[1] + jy], PROTO_CONFIG.margin),
    );
    const a = attackSpot(state, RECEIVER);
    expect(stridePoint(state, RECEIVER, 3)).toEqual(
      clampToPitch(toAttack(state.team, [a[0] + 3, a[1]]), PROTO_CONFIG.margin),
    );
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
