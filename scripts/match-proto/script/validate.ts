// The continuity validator: every beat follows from the one before it. Messages read
// `rule N: beat I: …`; an empty list means the script is valid. The last beat has no successor and
// is exempt from rules 5–8.
import { PROTO_CONFIG } from '../core/config.ts';
import { inPitch } from '../core/pitch.ts';
import {
  PASS_KINDS,
  RESTART_KINDS,
  SHOT_OUTCOMES,
  isShotLike,
  type Beat,
  type BeatKind,
  type Fixture,
  type Script,
  type TeamId,
} from '../core/types.ts';

const [HOLD_MIN, HOLD_MAX] = PROTO_CONFIG.grammar.validate.hold;
/** How far outside the pitch a beat's `to` may lie (metres). */
const TO_SLACK = PROTO_CONFIG.grammar.validate.toSlack;

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);
const isRestart = (kind: BeatKind): boolean => RESTART_KINDS.includes(kind);
const isCarry = (kind: BeatKind): boolean => kind === 'carry' || kind === 'takeOn';

type Report = (rule: number, beat: number, text: string) => void;

const teamOf = (fixture: Fixture, index: number | undefined): TeamId | undefined =>
  index !== undefined && Number.isInteger(index) && index >= 0 && index < fixture.players.length
    ? fixture.players[index].team
    : undefined;

function rule2(fixture: Fixture, b: Beat, report: Report): void {
  if (teamOf(fixture, b.actor) !== b.team)
    report(2, b.index, `actor ${b.actor} not of team ${b.team}`);
  if (b.receiver !== undefined) {
    if (teamOf(fixture, b.receiver) !== b.team) {
      report(2, b.index, `receiver ${b.receiver} not of team ${b.team}`);
    } else if (b.receiver === b.actor) report(2, b.index, `receiver is the actor`);
  }
  if (b.opponent !== undefined && teamOf(fixture, b.opponent) !== other(b.team)) {
    report(2, b.index, `opponent ${b.opponent} not of team ${other(b.team)}`);
  }
}

function rule3(b: Beat, report: Report): void {
  const shotLike = isShotLike(b);
  const bad: string[] = [];
  if (PASS_KINDS.includes(b.kind) && !shotLike && b.receiver === undefined) bad.push('no receiver');
  const needsOpponent = ['intercepted', 'tackled', 'foul', 'saved', 'blocked'].includes(b.outcome);
  if (needsOpponent && b.opponent === undefined) bad.push(`${b.outcome} without opponent`);
  if (b.outcome === 'offside' && !(b.kind === 'pass' && b.through))
    bad.push('offside off a through pass');
  if (b.through && b.kind !== 'pass') bad.push(`through on ${b.kind}`);
  if (b.header && b.kind !== 'shot') bad.push(`header on ${b.kind}`);
  if (SHOT_OUTCOMES.includes(b.outcome) && !shotLike) bad.push(`${b.outcome} on ${b.kind}`);
  if ((b.outcome === 'tackled' || b.outcome === 'foul') && !isCarry(b.kind)) {
    bad.push(`${b.outcome} on ${b.kind}`);
  }
  if (bad.length > 0) report(3, b.index, bad.join(', '));
}

function rule4(b: Beat, report: Report): void {
  if (!(b.hold >= HOLD_MIN && b.hold <= HOLD_MAX)) report(4, b.index, `hold ${b.hold}`);
  if (!inPitch(b.to, -TO_SLACK)) report(4, b.index, `to ${b.to[0]},${b.to[1]} off the pitch`);
}

/** Rules 5–8 between `b` and its successor `n`. */
function successor(b: Beat, n: Beat, report: Report): void {
  const i = b.index;
  const restartAllowed = (): boolean => {
    if (b.outcome === 'offside' || b.outcome === 'foul') return n.kind === 'freeKick';
    if (b.outcome === 'out') return ['throwIn', 'goalKick', 'corner'].includes(n.kind);
    if (b.outcome === 'goal') return n.kind === 'kickOff';
    if (b.outcome === 'wide') return n.kind === 'goalKick';
    if (b.outcome === 'saved') return n.kind === 'corner';
    if (b.outcome === 'blocked') return n.kind === 'corner' || n.kind === 'throwIn';
    return false;
  };
  if (b.outcome === 'complete') {
    const ok = isCarry(b.kind)
      ? n.actor === b.actor && n.team === b.team
      : n.actor === b.receiver && n.team === b.team;
    if (!ok || isRestart(n.kind)) report(5, i, `next beat ${n.index} does not follow on`);
  } else if (b.outcome === 'intercepted' || b.outcome === 'tackled') {
    const ok =
      n.actor === b.opponent && n.team === other(b.team) && n.possession === b.possession + 1;
    if (!ok || isRestart(n.kind)) report(6, i, `next beat ${n.index} is not the winner's`);
  } else if (['offside', 'foul', 'out', 'goal', 'wide'].includes(b.outcome)) {
    const sameTeam = b.outcome === 'foul';
    const team = b.outcome === 'out' ? n.team : sameTeam ? b.team : other(b.team);
    if (!restartAllowed() || n.team !== team)
      report(7, i, `next beat ${n.index} is not its restart`);
  } else if (b.outcome === 'saved') {
    const ok =
      (n.kind === 'corner' && n.team === b.team) ||
      (!isRestart(n.kind) && n.actor === b.opponent && n.team === other(b.team));
    if (!ok) report(8, i, `next beat ${n.index} does not follow the save`);
  } else if (b.outcome === 'blocked') {
    const ok =
      (n.kind === 'corner' && n.team === b.team) ||
      n.kind === 'throwIn' ||
      (!isRestart(n.kind) && n.actor === b.opponent && n.team === other(b.team)) ||
      (!isRestart(n.kind) && n.team === b.team);
    if (!ok) report(8, i, `next beat ${n.index} does not follow the block`);
  }
  if (isRestart(n.kind) && restartAllowed() && n.possession !== b.possession + 1) {
    report(7, i, `restart beat ${n.index} keeps possession ${n.possession}`);
  }
}

export function validateScript(script: Pick<Script, 'beats' | 'fixture'>): string[] {
  const out: string[] = [];
  const report: Report = (rule, beat, text) => out.push(`rule ${rule}: beat ${beat}: ${text}`);
  const { beats, fixture } = script;
  if (beats.length > 0 && beats[0].kind !== 'kickOff') report(1, 0, `starts with ${beats[0].kind}`);
  beats.forEach((b, i) => {
    if (b.index !== i) report(1, i, `index ${b.index}`);
    rule2(fixture, b, report);
    rule3(b, report);
    rule4(b, report);
    if (i + 1 < beats.length) successor(b, beats[i + 1], report);
  });
  return out;
}
