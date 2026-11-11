// The fitted writer (T820, its order T822): a ninety-minute script that performs every settled
// attempt, shot and foul exactly once. The record is the fact; the writer chooses only the order
// (greedy over the whole match: the cheapest touch by `touchCost`), the minutes of the rows the
// record gives none, the receivers, the points inside the cells, the clock and the connective
// tissue (link carries, miscontrols, restart deliveries no recorded pass makes). A pure function of
// the settled match and the seed (-> ARCH-5).
import { PROTO_CONFIG } from '../core/config.ts';
import { PITCH, toAttack } from '../core/pitch.ts';
import {
  EV,
  EVENT_KINDS,
  EVENT_RESULTS,
  FO,
  SET_PIECES,
  SH,
  SHOT_OUTCOMES,
  fixtureOf,
  type Settled,
} from '../core/settled.ts';
import { nominalSpot } from '../core/shape.ts';
import {
  type Beat,
  type BeatKind,
  type BeatOutcome,
  type Fixture,
  PASS_KINDS,
  type Phase,
  type Script,
  type TeamId,
  type Vec,
} from '../core/types.ts';
import { dist } from '../core/vec.ts';
import {
  cellAt,
  cellCentre,
  cellDistance,
  cellsMeet,
  goalAim,
  intoCell,
  keeperHold,
  pointAway,
  restartSpot,
} from './cells.ts';
import { createRng } from '../core/rng.ts';
import { FLOATING, buildTouches, dealFixed, firstCell } from './touches.ts';

const FIT = PROTO_CONFIG.fit;
const GRAMMAR = PROTO_CONFIG.grammar;
const R = (name: (typeof EVENT_RESULTS)[number]) => EVENT_RESULTS.indexOf(name);
const KIND = (code: number) => EVENT_KINDS[code]!;
const other = (t: TeamId): TeamId => (t === 0 ? 1 : 0);

interface Owed {
  kind: BeatKind;
  team: TeamId;
  spot: Vec;
  /** A touch that must deliver it (a direct free-kick shot after its foul). */
  via?: number;
}
interface Pending {
  event: number;
  actor: number;
  side: TeamId;
  from: Vec;
  kind: BeatKind;
  outcome: BeatOutcome;
  minute: number;
}

const phaseOf = (side: TeamId, ball: Vec): Phase => {
  const x = toAttack(side, ball)[0];
  return x < GRAMMAR.phaseX.progression
    ? 'buildUp'
    : x < GRAMMAR.phaseX.finalThird
      ? 'progression'
      : 'finalThird';
};

/** Metres between two cells' centres, by cell pair. */
const CELL_DISTANCE: number[][] = Array.from({ length: 40 }, (_, a) =>
  Array.from({ length: 40 }, (_, b) => cellDistance(a, b)),
);
const cellGap = (a: number, b: number): number =>
  a < 0 || b < 0 ? cellDistance(Math.max(a, 0), Math.max(b, 0)) : CELL_DISTANCE[a]![b]!;

/**
 * A script performing every row of `settled`. Rows the record gives a minute (shots, their sources,
 * booked fouls) are played in it; every other row floats and is played in whichever minute the
 * order of play reaches it, each minute taking its even share of all touches (T822). The order is
 * greedy: the next touch is the one starting nearest the ball (`touchCost`), ties broken by the
 * seed's order.
 */
export function writeFitted(settled: Settled, seed: string): Script {
  const fixture = fixtureOf(settled);
  const touches = buildTouches(settled, dealFixed(settled));
  const played = touches.map(() => false);
  const startCell = touches.map((t) => firstCell(settled, t));
  // The seed's order of the touches: ties of `touchCost` go to the earlier.
  const rng = createRng(seed).fork('order');
  const order = touches.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const total = [0, 0];
  const done = [0, 0];
  const endsTotal = [0, 0];
  const endsDone = [0, 0];
  /** Whether touch `i` ends its side's possession when played (a failed release, a shot, a lost carry). */
  const ends = touches.map((t) => {
    const r = t.release;
    if (r === undefined) {
      const last = t.carries[t.carries.length - 1];
      return last !== undefined && settled.events[last]![EV.result] !== R('complete');
    }
    // A shot that wins a corner and a pass out for a corner keep the ball for the side.
    if ('shot' in r) return settled.shots[r.shot]![SH.corner] !== 1;
    if ('foul' in r) return false;
    const res = settled.events[r.event]![EV.result]!;
    return res !== R('complete') && res !== R('looseKept') && res !== R('cornerWon');
  });
  touches.forEach((t, i) => {
    total[t.side]!++;
    if (ends[i]) endsTotal[t.side]!++;
  });
  /** Whether touch `i` releases a pass the record flags as a corner's or free kick's delivery. */
  const setPiece = touches.map(
    (t) =>
      t.release !== undefined &&
      'event' in t.release &&
      SET_PIECES[settled.events[t.release.event]![EV.setPiece]!] !== 'none',
  );
  const beats: Beat[] = [];
  const minuteOf: number[] = [];
  let possession = 0;
  let side: TeamId = 0;
  let ball: Vec = [PITCH.length / 2, PITCH.width / 2];
  let holder = -1;
  let owed: Owed | null = null;
  let pending: Pending | null = null;
  let nextOwed = -1;
  /** The touch a pass's receiver was chosen for (T822). */
  let intended = -1;
  let minute = 0;
  /** Touches played before the minute being written. */
  let minuteStart = 0;

  const spotOf = (index: number, at: Vec = ball, team: TeamId = side): Vec =>
    nominalSpot({ fixture, ball: at, team, phase: phaseOf(team, at) }, index);
  const nearestBy = (team: TeamId, at: Vec, exclude: number[] = [], keeper = false): number => {
    let best = -1;
    for (const p of fixture.teams[team].players) {
      if (exclude.includes(p.index) || (p.slot === 0 && !keeper)) continue;
      if (best < 0 || dist(spotOf(p.index, at), at) < dist(spotOf(best, at), at)) best = p.index;
    }
    return best;
  };
  const push = (
    b: Pick<Beat, 'team' | 'move' | 'kind' | 'actor' | 'from' | 'to' | 'outcome'> & Partial<Beat>,
  ): Beat => {
    const prev = beats[beats.length - 1];
    if (prev !== undefined && (prev.team !== b.team || b.kind === 'kickOff' || isRestart(b.kind)))
      possession++;
    const beat: Beat = {
      loft: false,
      through: false,
      header: false,
      hold: 0,
      ...b,
      index: beats.length,
      possession,
      phase: isRestart(b.kind) ? 'setPiece' : phaseOf(b.team, b.from),
    };
    beats.push(beat);
    minuteOf.push(minute);
    return beat;
  };
  const isRestart = (k: BeatKind) =>
    k === 'kickOff' || k === 'throwIn' || k === 'goalKick' || k === 'corner' || k === 'freeKick';

  /** A link carry by the holder to a point in `cell` of his side, when the ball is not there. */
  const linkTo = (cell: number) => {
    if (cellAt(side, ball) === cell) return;
    const to = intoCell(side, cell, spotOf(holder));
    push({
      team: side,
      move: 'link',
      kind: 'carry',
      actor: holder,
      from: ball,
      to,
      outcome: 'complete',
    });
    ball = to;
  };
  /** The holder's heavy touch: the ball runs to `to` of the other side. */
  const miscontrol = (to: number) => {
    const at = spotOf(to, ball, other(side));
    push({
      team: side,
      move: 'miscontrol',
      kind: 'carry',
      actor: holder,
      opponent: to,
      from: ball,
      to: at,
      outcome: 'loose',
    });
    side = other(side);
    holder = to;
    ball = at;
    pending = null;
  };
  // A touch that must follow another (a shot after its source pass) waits until that one is played.
  const after = touches.map(() => -1);
  touches.forEach((t, i) => {
    if (t.next !== undefined) after[t.next] = i;
  });
  /** Touches `team` may play now, in the seed's order: this minute's fixed ones and every floating one. */
  const unplayed = (team: TeamId) =>
    order.filter((i) => {
      const t = touches[i]!;
      return (
        !played[i] &&
        t.side === team &&
        (t.minute === minute || t.minute === FLOATING) &&
        (after[i]! < 0 || played[after[i]!])
      );
    });
  const fixedLeft = (team?: TeamId) =>
    touches.some(
      (t, i) => !played[i] && t.minute === minute && (team === undefined || t.side === team),
    );
  /** The touches played by the end of minute `m`: an even share of all of them. */
  const quota = (m: number) => Math.round(((m + 1) * touches.length) / 90);
  const quotaMet = () => done[0]! + done[1]! >= quota(minute);
  /**
   * The price of `team` playing touch `i` with the ball in `cell`: the metres to where it starts,
   * less `fit.fixedPull` for a touch fixed to this minute; a touch ending the possession is cheaper
   * by up to `fit.paceBias` the further `team` is ahead of the other side in its share of touches
   * played (dearer when behind), and by `fit.fixedPull` once the minute's share is met while the
   * other side still has a fixed touch in it.
   */
  const touchCost = (team: TeamId, i: number, cell: number): number => {
    let cost = cellGap(startCell[i]!, cell);
    const met = quotaMet();
    // The pull grows as the minute fills, so its fixed touches come before its share runs out.
    const fill = Math.min(
      1,
      (done[0]! + done[1]! - minuteStart) / Math.max(1, quota(minute) - minuteStart),
    );
    if (touches[i]!.minute === minute)
      cost -= met ? FIT.fixedPush : FIT.fixedPull + fill * FIT.fixedRamp;
    // A corner's or free kick's delivery waits for its restart rather than be played in open play.
    if (setPiece[i]) cost += FIT.setPieceWait;
    if (ends[i]) {
      // Ahead of the other side, or behind in spending its own possession-ending touches, a side
      // ends its possession sooner; so neither side runs out of touches, nor of ways to lose the ball.
      const share = done[team]! / total[team]!;
      const lead = share - done[other(team)]! / total[other(team)]!;
      const endsLead = endsDone[team]! / Math.max(1, endsTotal[team]!) - share;
      cost -= Math.min(Math.max((lead - endsLead) / FIT.paceSlack, -1), 1) * FIT.paceBias;
      if (met && fixedLeft(other(team))) cost -= FIT.fixedPush;
    }
    return cost;
  };
  /** A touch whose release is a goal the record credits to no passer. */
  const unassisted = (i: number): boolean => {
    const r = touches[i]!.release;
    if (r === undefined || !('shot' in r)) return false;
    const s = settled.shots[r.shot]!;
    return SHOT_OUTCOMES[s[SH.outcome]!] === 'goal' && s[SH.passer]! < 0;
  };
  /** The holder has the ball from a recorded completed pass, his own carries since (as count.ts reads an assist). */
  const fed = (): boolean => {
    for (let k = beats.length - 1; k >= 0; k--) {
      const b = beats[k]!;
      if (b.team !== side) return false;
      if (b.actor === holder && (b.kind === 'carry' || b.kind === 'takeOn')) continue;
      return (
        b.event !== undefined &&
        PASS_KINDS.includes(b.kind) &&
        b.outcome === 'complete' &&
        b.receiver === holder
      );
    }
    return false;
  };
  /**
   * The touch `team` plays next with the ball in `cell`, skipping `skip`'s while another is left.
   * For a pass landing at `at`, a touch also costs `fit.placeWeight` times the metres from its
   * player's place (`nominalSpot`) to `at`: the man the pass is played to stands near it (T822).
   */
  const choose = (team: TeamId, cell: number, skip = -1, at?: Vec): number => {
    const all = unplayed(team);
    if (nextOwed >= 0 && all.includes(nextOwed)) return nextOwed;
    const fresh = all.filter((i) => !(skip >= 0 && unassisted(i)));
    const left = fresh.length > 0 ? fresh : all;
    const open = left.filter((i) => touches[i]!.actor !== skip);
    const pool = open.length > 0 ? open : left;
    const place = new Map<number, number>();
    if (at !== undefined)
      for (const p of fixture.teams[team].players)
        place.set(p.index, FIT.placeWeight * dist(spotOf(p.index, at, team), at));
    return cheapest(team, pool, cell, place);
  };
  const cheapest = (
    team: TeamId,
    pool: readonly number[],
    cell: number,
    place?: ReadonlyMap<number, number>,
  ): number => {
    let best = -1;
    let bestCost = Infinity;
    for (const i of pool) {
      const cost = touchCost(team, i, cell) + (place?.get(touches[i]!.actor) ?? 0);
      if (cost < bestCost) [best, bestCost] = [i, cost];
    }
    return best;
  };

  /** Writes a pending pass to `receiver`, who then has the ball in its `to` cell. */
  const resolve = (receiver: number) => {
    const p = pending!;
    pending = null;
    const e = settled.events[p.event]!;
    const to = pointAway(
      p.side,
      e[EV.to]!,
      spotOf(receiver, p.from, p.side),
      p.from,
      GRAMMAR.minPass,
    );
    push({
      team: p.side,
      move: KIND(e[EV.kind]!),
      kind: p.kind,
      actor: p.actor,
      receiver,
      from: p.from,
      to,
      outcome: p.outcome,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      reason: KIND(e[EV.kind]!) === 'cutBack' ? 'cutBack' : undefined,
      event: p.event,
    });
    side = p.side;
    holder = receiver;
    ball = to;
  };
  const isLofted = (k: number) => KIND(k) === 'long' || KIND(k) === 'cross';

  /** Plays a pass event from the ball's point, `kind` the restart it delivers or `pass`. */
  const playPass = (id: number, kind: BeatKind) => {
    const e = settled.events[id]!;
    const actor = e[EV.actor]!;
    const res = e[EV.result]!;
    const toCell = e[EV.to]!;
    const base = {
      team: side,
      move: KIND(e[EV.kind]!),
      kind,
      actor,
      from: ball,
      loft: isLofted(e[EV.kind]!),
      through: KIND(e[EV.kind]!) === 'through',
      reason: KIND(e[EV.kind]!) === 'cutBack' ? ('cutBack' as const) : undefined,
      event: id,
    };
    if (res === R('complete') || res === R('looseKept')) {
      pending = {
        event: id,
        actor,
        side,
        from: ball,
        kind,
        outcome: res === R('complete') ? 'complete' : 'loose',
        minute,
      };
      ball = intoCell(side, toCell, cellCentre(side, toCell));
      holder = -1;
      return actor;
    }
    const to = intoCell(side, toCell, spotOf(actor));
    if (res === R('intercepted') || res === R('looseRecovered') || res === R('tackled')) {
      const at = res === R('tackled') ? ball : to;
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), at);
      push({
        ...base,
        to,
        opponent: by,
        outcome:
          res === R('intercepted') ? 'intercepted' : res === R('tackled') ? 'tackled' : 'loose',
      });
      side = other(side);
      holder = by;
      ball = at;
      return actor;
    }
    if (res === R('offside')) {
      push({ ...base, to, receiver: e[EV.other]!, through: true, outcome: 'offside' });
      owed = {
        kind: 'freeKick',
        team: other(side),
        spot: restartSpot('freeKick', other(side), to),
      };
    } else {
      push({ ...base, to, outcome: 'out' });
      owed =
        res === R('outTouch')
          ? { kind: 'throwIn', team: other(side), spot: restartSpot('throwIn', other(side), to) }
          : res === R('outByline')
            ? {
                kind: 'goalKick',
                team: other(side),
                spot: restartSpot('goalKick', other(side), to),
              }
            : { kind: 'corner', team: side, spot: restartSpot('corner', side, to) };
    }
    holder = -1;
    return actor;
  };

  const playShot = (id: number, kind: BeatKind) => {
    const s = settled.shots[id]!;
    const out = SHOT_OUTCOMES[s[SH.outcome]!]!;
    const keeper = s[SH.keeper]!;
    const shooter = s[SH.shooter]!;
    const from = ball;
    const to =
      out === 'save'
        ? keeperHold(other(side))
        : out === 'block'
          ? from
          : goalAim(
              side,
              out === 'miss' ? (toAttack(side, from)[1] < PITCH.width / 2 ? -5 : 5) : 0,
            );
    const opponent =
      out === 'save' ? keeper : out === 'block' ? nearestBy(other(side), from) : undefined;
    const outcome: BeatOutcome =
      out === 'goal' ? 'goal' : out === 'save' ? 'saved' : out === 'block' ? 'blocked' : 'wide';
    push({
      team: side,
      move: kind === 'freeKick' ? 'freeKick' : 'shot',
      kind,
      actor: shooter,
      opponent,
      from,
      to,
      outcome,
      header: s[SH.header] === 1,
      shot: id,
    });
    const corner = s[SH.corner] === 1;
    if (out === 'goal')
      owed = {
        kind: 'kickOff',
        team: other(side),
        spot: restartSpot('kickOff', other(side), from),
      };
    else if (corner) owed = { kind: 'corner', team: side, spot: restartSpot('corner', side, from) };
    else if (out === 'miss')
      owed = {
        kind: 'goalKick',
        team: other(side),
        spot: restartSpot('goalKick', other(side), from),
      };
    else {
      side = other(side);
      holder = opponent!;
      ball = to;
      return;
    }
    holder = -1;
  };

  /** Plays touch `i` by its actor, who has the ball. */
  const playTouch = (i: number, delivering?: Owed) => {
    played[i] = true;
    const t = touches[i]!;
    done[t.side]!++;
    if (ends[i]) endsDone[t.side]!++;
    nextOwed = t.next ?? -1;
    for (const c of t.carries) {
      const e = settled.events[c]!;
      linkTo(e[EV.from]!);
      const to = intoCell(side, e[EV.to]!, spotOf(holder));
      const takeOn = KIND(e[EV.kind]!) === 'takeOn';
      if (e[EV.result] === R('complete')) {
        push({
          team: side,
          move: KIND(e[EV.kind]!),
          kind: takeOn ? 'takeOn' : 'carry',
          actor: holder,
          opponent: takeOn ? nearestBy(other(side), ball) : undefined,
          from: ball,
          to,
          outcome: 'complete',
          event: c,
        });
        ball = to;
        continue;
      }
      const by = e[EV.other]! >= 0 ? e[EV.other]! : nearestBy(other(side), ball);
      push({
        team: side,
        move: KIND(e[EV.kind]!),
        kind: takeOn ? 'takeOn' : 'carry',
        actor: holder,
        opponent: by,
        from: ball,
        to,
        outcome: 'tackled',
        event: c,
      });
      side = other(side);
      holder = by;
      return;
    }
    const r = t.release;
    if (r === undefined) return;
    if ('event' in r) {
      if (delivering === undefined) linkTo(settled.events[r.event]![EV.from]!);
      playPass(r.event, delivering?.kind ?? 'pass');
    } else if ('shot' in r) {
      if (delivering === undefined) linkTo(settled.shots[r.shot]![SH.cell]!);
      playShot(r.shot, delivering?.kind ?? 'shot');
    } else {
      const f = settled.fouls[r.foul]!;
      linkTo(f[FO.cell]!);
      push({
        team: side,
        move: 'foul',
        kind: 'carry',
        actor: holder,
        opponent: f[FO.fouler]!,
        from: ball,
        to: ball,
        outcome: 'foul',
        foul: r.foul,
      });
      owed = {
        kind: 'freeKick',
        team: side,
        spot: restartSpot('freeKick', side, ball),
        via: t.next,
      };
      nextOwed = -1;
      holder = -1;
    }
  };

  /** Delivers the owed restart: by a recorded pass from its spot when one is left, else connectively. */
  const deliver = () => {
    const o = owed!;
    owed = null;
    side = o.team;
    ball = o.spot;
    if (o.via !== undefined && !played[o.via] && touches[o.via]!.minute === minute) {
      holder = touches[o.via]!.actor;
      playTouch(o.via, o);
      return;
    }
    const spotCell = cellAt(side, ball);
    const want = o.kind === 'corner' ? 'corner' : o.kind === 'freeKick' ? 'freeKick' : 'none';
    let best = -1;
    let bestScore = Infinity;
    for (const i of unplayed(side)) {
      const t = touches[i]!;
      if (t.carries.length > 0 || t.release === undefined || !('event' in t.release)) continue;
      const e = settled.events[t.release.event]!;
      if (!cellsMeet(e[EV.from]!, spotCell)) continue;
      const score =
        (SET_PIECES[e[EV.setPiece]!] === want ? 0 : 1000) + cellDistance(e[EV.from]!, spotCell);
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    if (best >= 0) {
      holder = touches[best]!.actor;
      playTouch(best, o);
      return;
    }
    // A goal kick is the keeper's, so the touch it is delivered to is another man's (T822: s09's
    // keeper kicked to himself when his own touch started nearest).
    const nextTouch = choose(side, spotCell, o.kind === 'goalKick' ? side * 11 : -1);
    const taker =
      o.kind === 'goalKick'
        ? side * 11
        : nearestBy(side, ball, nextTouch >= 0 ? [touches[nextTouch]!.actor] : []);
    const receiver =
      nextTouch >= 0 && touches[nextTouch]!.actor !== taker
        ? touches[nextTouch]!.actor
        : nearestBy(side, ball, [taker]);
    const cell =
      nextTouch >= 0 ? firstCell(settled, touches[nextTouch]!) : cellAt(side, spotOf(receiver));
    const to = pointAway(side, cell, spotOf(receiver), ball, GRAMMAR.minPass);
    push({
      team: side,
      move: 'restart',
      kind: o.kind,
      actor: taker,
      receiver,
      from: ball,
      to,
      outcome: 'complete',
    });
    holder = receiver;
    ball = to;
  };

  const settledMinute = () => {
    for (;;) {
      // The minute ends with its share of touches played and nothing fixed to it left.
      if (quotaMet() && !fixedLeft()) break;
      const mine = unplayed(side);
      const theirs = unplayed(other(side));
      if (owed !== null) {
        // With nothing left in the minute the restart waits for the next one.
        if (mine.length + theirs.length === 0) break;
        deliver();
        continue;
      }
      if (pending !== null) {
        const p: Pending = pending;
        const i = choose(p.side, cellAt(p.side, ball), p.actor, ball);
        if (i >= 0 && touches[i]!.actor !== p.actor) {
          resolve(touches[i]!.actor);
          // He was chosen for that touch: it is the one he plays.
          intended = i;
          continue;
        }
        if (i < 0 && theirs.length === 0) break;
        // Nobody else of his side is left: a nominal receiver loses it.
        resolve(nearestBy(p.side, ball, [p.actor]));
        continue;
      }
      if (mine.length + theirs.length === 0) break;
      if (mine.length === 0) {
        miscontrol(touches[choose(other(side), cellAt(other(side), ball))]!.actor);
        continue;
      }
      // The minute waits only on the other side's fixed touch: with no touch left that ends this
      // possession, or with that touch a goal nobody's pass made, the holder loses the ball to it.
      if (quotaMet() && fixedLeft(other(side))) {
        const waiting = theirs.filter((i) => touches[i]!.minute === minute);
        const lone = waiting.find((i) => unassisted(i));
        if (waiting.length > 0 && (lone !== undefined || !mine.some((i) => ends[i]))) {
          miscontrol(
            touches[lone ?? cheapest(other(side), waiting, cellAt(other(side), ball))]!.actor,
          );
          continue;
        }
      }
      // The holder plays on with a touch of his own; another man's touch needs the ball first.
      const here = cellAt(side, ball);
      const own = mine.filter((i) => touches[i]!.actor === holder);
      const pickOwn =
        nextOwed >= 0 && mine.includes(nextOwed)
          ? nextOwed
          : own.includes(intended)
            ? intended
            : own.length > 0
              ? cheapest(side, own, here)
              : choose(side, here);
      intended = -1;
      // Possessions alternate, so a side that has fewer possession-ending rows than the other must
      // lose the ball connectively that many times: it does so where it is spending its ending
      // rows faster than the other side spends its own, never on a touch fixed to the minute (T822).
      const endsShare = (t: TeamId) => endsDone[t]! / Math.max(1, endsTotal[t]!);
      const spread =
        ends[pickOwn] &&
        touches[pickOwn]!.minute === FLOATING &&
        touches[pickOwn]!.actor === holder &&
        endsShare(side) - endsShare(other(side)) > FIT.endsSlack &&
        theirs.length > 0;
      // A goal the record credits to nobody's pass is not scored straight off a pass to the scorer.
      if (spread || touches[pickOwn]!.actor !== holder || (unassisted(pickOwn) && fed())) {
        const them =
          theirs.length > 0
            ? touches[choose(other(side), cellAt(other(side), ball))]!.actor
            : nearestBy(other(side), ball);
        miscontrol(them);
        continue;
      }
      playTouch(pickOwn);
    }
  };

  for (minute = 0; minute < 90; minute++) {
    minuteStart = done[0]! + done[1]!;
    if (minute === 0 || minute === 45) {
      pending = null;
      owed = { kind: 'kickOff', team: minute === 0 ? 0 : 1, spot: restartSpot('kickOff', 0, ball) };
      // A half starts on its minute, whether or not the minute holds a touch.
      deliver();
    }
    settledMinute();
    if (minute === 44 || minute === 89) {
      // A restart owed at the whistle is still taken, and a pass in flight, its delivery's
      // included, is received before the half ends.
      const o = owed as Owed | null;
      if (o !== null && o.kind !== 'kickOff') deliver();
      if (pending !== null)
        resolve(nearestBy((pending as Pending).side, ball, [(pending as Pending).actor]));
      owed = null;
      nextOwed = -1;
    }
  }

  // A minute whose beats need more than its sixty seconds is pressed into them, every part alike,
  // so each beat keeps its record minute; `minuteTimes` gives what each minute needed.
  for (let m = 0; m < 90; m++) {
    const list = beats.filter((_, i) => minuteOf[i] === m);
    if (list.length === 0) continue;
    const { holds, need } = minuteTimes(list, m);
    const press = need > 60 ? 60 / need : 1;
    let t = m * 60;
    for (const [k, b] of list.entries()) {
      t += deadOf(b, k, m) * press;
      b.hold = Math.floor(holds[k]! * press * 100) / 100;
      b.clock = Math.floor(t * 100) / 100;
      t += (holds[k]! + travel(b)) * press;
    }
  }
  const last = beats[beats.length - 1];
  return {
    seed: `${settled.id}:${seed}`,
    fixture,
    beats,
    times: beats.map((b) => b.clock!),
    nominalSeconds: last === undefined ? 0 : last.clock! + last.hold + travel(last),
    bound: true,
  };
}

const isRestartKind = (k: BeatKind) =>
  k === 'kickOff' || k === 'throwIn' || k === 'goalKick' || k === 'corner' || k === 'freeKick';
/** Nominal seconds a beat's ball travels (`grammar.speeds`); a foul has none. */
export const travel = (b: Beat): number => {
  const speeds = GRAMMAR.speeds;
  return b.outcome === 'foul'
    ? 0
    : dist(b.from, b.to) /
        (b.shot !== undefined
          ? speeds.shot
          : b.kind === 'carry' || b.kind === 'takeOn'
            ? speeds.carry
            : b.loft
              ? speeds.loft
              : speeds.ground);
};
/** Seconds the restart beat `b` (the `k`th of minute `m`) takes off its minute; a half's opening kick-off none. */
const deadOf = (b: Beat, k: number, m: number): number =>
  isRestartKind(b.kind) && !(k === 0 && b.kind === 'kickOff' && (m === 0 || m === 45))
    ? FIT.dead[b.kind as keyof typeof FIT.dead]
    : 0;
/**
 * A minute's clock before pressing: its sixty seconds less its restarts' dead time shared equally
 * between its beats as hold plus travel, each hold within `fit.hold`, and the seconds that needs.
 */
export function minuteTimes(list: readonly Beat[], m: number): { holds: number[]; need: number } {
  const dead = list.reduce((s, b, k) => s + deadOf(b, k, m), 0);
  const share = (60 - dead) / list.length;
  const holds = list.map((b) => Math.min(Math.max(share - travel(b), FIT.hold[0]), FIT.hold[1]));
  const need = list.reduce((s, b, k) => s + deadOf(b, k, m) + holds[k]! + travel(b), 0);
  return { holds, need };
}

/** The fixture a fitted script plays (re-exported for the CLI). */
export const fittedFixture = (settled: Settled): Fixture => fixtureOf(settled);
