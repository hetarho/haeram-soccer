import { globalReachOf, localBaseOf } from '../../../../packages/engine/src/bases';
import type {
  ClubPolicy,
  Command,
  Direction,
  DirectionKey,
  PolicyKey,
  PolicyLevel,
  World,
} from '../../../../packages/contracts/src/types';
import {
  BUILD_SLOTS,
  type BuildSlot,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import { buildOf, cardOf, sameBuild, type PresetRows } from '../../../../packages/engine/src/build';
import { presetBoard } from '../../../../packages/engine/src/presets';
import {
  POLICY_INFO,
  POLICY_KEYS,
  policyOf,
  policyPreview,
} from '../../../../packages/engine/src/policy';
import { gateProjection, operatingCosts } from '../../../../packages/engine/src/finance';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { SEASON_ROUNDS } from '../../../../packages/engine/src/calendar';
import {
  DIRECTION_DEFAULT,
  DIRECTION_KEYS,
  directionOf,
  directionOption,
} from '../../../../packages/engine/src/direction';
import { TICKET_LEVELS } from './ticketLevels';
import { isDirectionRow, type AreaKey, type DirectionArea } from './areas';

/**
 * The operating board's draft (→WEB-60): the strategy cards and the dials the owner tapped, kept
 * out of the world until 적용. `name` labels a preset or a saved strategy (→WEB-61) and goes with
 * `build` only.
 */
export type BoardDraft = {
  build?: ClubBuild;
  policy?: Partial<ClubPolicy>;
  ticket?: number;
  /** Direction rows (→ECON-25) by key: the option ids the draft would set. */
  direction?: Partial<Record<DirectionKey, string>>;
  name?: string;
};
/** A dial change asked for from elsewhere, such as a cash remedy (→WEB-44); T071's store. */
export type BoardRequest = {
  policy?: { key: PolicyKey; level: PolicyLevel };
  ticket?: number;
  /** An area to unfold without drafting anything, from a line naming one of its rows. */
  area?: AreaKey;
};

export type CardChange = { kind: 'card'; slot: BuildSlot; from?: string; to?: string };
export type PolicyChange = { kind: 'policy'; key: PolicyKey; from: PolicyLevel; to: PolicyLevel };
export type TicketChange = { kind: 'ticket'; from: number; to: number };
export type DirectionChange = { kind: 'direction'; key: DirectionKey; from: string; to: string };
export type DraftChange = CardChange | PolicyChange | TicketChange | DirectionChange;

/** The cards the draft would change, in slot order; none when its build is the one in force. */
function cardChanges(w: World, d: BoardDraft): CardChange[] {
  if (!d.build) return [];
  const current = buildOf(w);
  return BUILD_SLOTS.filter((slot) => d.build![slot] !== current[slot]).map((slot) => ({
    kind: 'card',
    slot,
    from: current[slot],
    to: d.build![slot],
  }));
}

/** The changed cards, then the changed dials in their command order: every policy key, the ticket. */
export function draftChanges(w: World, d: BoardDraft): DraftChange[] {
  const policy = policyOf(w);
  const changes: DraftChange[] = cardChanges(w, d);
  for (const key of POLICY_KEYS) {
    const level = d.policy?.[key];
    if (level !== undefined && level !== policy[key])
      changes.push({ kind: 'policy', key, from: policy[key], to: level });
  }
  if (d.ticket !== undefined && d.ticket !== w.ticket)
    changes.push({ kind: 'ticket', from: w.ticket, to: d.ticket });
  for (const key of DIRECTION_KEYS) {
    const option = d.direction?.[key];
    if (option !== undefined && option !== directionOf(w, key))
      changes.push({ kind: 'direction', key, from: directionOf(w, key), to: option });
  }
  return changes;
}

/**
 * The commands 적용 sends, in order: the strategy first (named for a preset or a saved strategy),
 * then one `policy` per changed dial, the ticket, then one `direction` per changed row. A draft
 * equal to the world sends nothing.
 */
export function draftCommands(w: World, d: BoardDraft): Command[] {
  const commands: Command[] = [];
  if (d.build && cardChanges(w, d).length)
    commands.push({ type: 'build', build: d.build, ...(d.name ? { name: d.name } : {}) });
  for (const change of draftChanges(w, d))
    if (change.kind === 'policy')
      commands.push({ type: 'policy', key: change.key, level: change.to });
    else if (change.kind === 'ticket') commands.push({ type: 'ticket', price: change.to });
    else if (change.kind === 'direction')
      commands.push({ type: 'direction', key: change.key, option: change.to });
  return commands;
}

/** A request from elsewhere as a draft of that one dial; a level already in force drafts nothing. */
export function draftFromRequest(w: World, request: BoardRequest): BoardDraft {
  const draft: BoardDraft = {};
  if (request.policy && request.policy.level !== policyOf(w)[request.policy.key])
    draft.policy = { [request.policy.key]: request.policy.level };
  if (request.ticket !== undefined && request.ticket !== w.ticket) draft.ticket = request.ticket;
  return draft;
}

/** The world as the draft would leave it: synergies, odds and projections read it. */
export function draftWorld(w: World, d: BoardDraft): World {
  return {
    ...w,
    ...(d.build ? { build: d.build } : {}),
    ...(d.policy ? { policy: { ...policyOf(w), ...d.policy } } : {}),
    ...(d.ticket !== undefined ? { ticket: d.ticket } : {}),
    ...(d.direction ? { direction: directionWith(w, d.direction) } : {}),
  };
}
/** The world's rows with the draft's over them, defaults left out as the engine stores them. */
function directionWith(w: World, rows: Partial<Record<DirectionKey, string>>): Direction {
  const next: Record<string, string> = { ...w.direction };
  for (const [key, option] of Object.entries(rows) as [DirectionKey, string][])
    if (option === DIRECTION_DEFAULT[key]) delete next[key];
    else next[key] = option;
  return next as Direction;
}

/** Drops whatever equals the world, so an untouched or reverted draft is empty. */
function tidy(w: World, d: BoardDraft): BoardDraft {
  const next: BoardDraft = {};
  if (d.build && cardChanges(w, d).length) {
    next.build = d.build;
    if (d.name) next.name = d.name;
  }
  const policy = Object.fromEntries(
    draftChanges(w, d).flatMap((change) =>
      change.kind === 'policy' ? [[change.key, change.to]] : [],
    ),
  ) as Partial<ClubPolicy>;
  if (Object.keys(policy).length) next.policy = policy;
  if (d.ticket !== undefined && d.ticket !== w.ticket) next.ticket = d.ticket;
  const direction = Object.fromEntries(
    draftChanges(w, d).flatMap((change) =>
      change.kind === 'direction' ? [[change.key, change.to]] : [],
    ),
  );
  if (Object.keys(direction).length) next.direction = direction;
  return next;
}
/** One card tapped in its area row; the draft's strategy becomes the owner's own mix. */
export function withCard(w: World, d: BoardDraft, slot: BuildSlot, card?: string): BoardDraft {
  const build: ClubBuild = { ...(d.build ?? buildOf(w)) };
  if (card) (build as Record<string, string>)[slot] = card;
  else delete build[slot];
  return tidy(w, { ...d, build, name: undefined });
}
/**
 * A preset or saved direction tapped, with its name: its cards, and with `rows` its whole board
 * (→ECON-25); an entry saved before it kept rows drafts its cards only.
 */
export function withStrategy(
  w: World,
  d: BoardDraft,
  build: ClubBuild,
  name?: string,
  rows?: PresetRows,
) {
  const cards = { ...d, build, name: sameBuild(build, buildOf(w)) ? undefined : name };
  if (!rows) return tidy(w, cards);
  // A preset or a saved direction with rows fills every row (→ECON-25): the rows it names, and
  // every other row at its default.
  const board = presetBoard({ build, rows });
  const direction = Object.fromEntries(
    DIRECTION_KEYS.map((key) => [key, board.direction[key] ?? DIRECTION_DEFAULT[key]]),
  );
  return tidy(w, { ...cards, policy: board.policy, ticket: board.ticket, direction });
}
/** A dial step tapped; the level in force takes the dial out of the draft. */
export function withPolicy(w: World, d: BoardDraft, key: PolicyKey, level: PolicyLevel) {
  return tidy(w, { ...d, policy: { ...d.policy, [key]: level } });
}
/** A ticket preset tapped. */
export function withTicket(w: World, d: BoardDraft, price: number) {
  return tidy(w, { ...d, ticket: price });
}
/** A direction row's option tapped; the option in force takes the row out of the draft. */
export function withDirection(w: World, d: BoardDraft, key: DirectionKey, option: string) {
  return tidy(w, { ...d, direction: { ...d.direction, [key]: option } });
}

/**
 * What one changed dial does to the money (→ECON-16, →ECON-18): its cost per round, the change in
 * yearly fixed costs and the cash at season end with only that dial moved; the ticket adds its gate.
 * Once the season's rounds are paid the per-round cost is next season's first round.
 */
export function dialPreview(w: World, change: PolicyChange | TicketChange) {
  const next: World =
    change.kind === 'policy'
      ? { ...w, policy: { ...policyOf(w), [change.key]: change.to } }
      : { ...w, ticket: change.to };
  const later = w.round >= SEASON_ROUNDS;
  const perRound =
    change.kind === 'policy' && !later
      ? policyPreview(w, change.key, change.to).nextRoundChange
      : (
          BigInt(operatingCosts(next, later ? 1 : w.round + 1).nextRound) -
          BigInt(operatingCosts(w, later ? 1 : w.round + 1).nextRound)
        ).toString();
  return {
    perRound,
    annual: (BigInt(operatingCosts(next).annual) - BigInt(operatingCosts(w).annual)).toString(),
    seasonEnd: financeProjection(next).seasonEnd,
    seasonEndNow: financeProjection(w).seasonEnd,
    ...(change.kind === 'ticket' ? { gate: gateProjection(next), gateNow: gateProjection(w) } : {}),
  };
}

/** The base an area's rows build, as its header names it (→ECON-34): 지역 기반 12. */
export function areaBase(w: World, area: DirectionArea) {
  if (area.base === 'local') return `지역 기반 ${Math.round(localBaseOf(w))}`;
  if (area.base === 'global') return `글로벌 인지도 ${Math.round(globalReachOf(w))}`;
  return undefined;
}

/**
 * The options in force in an area's rows — its card, then each dial's step and direction row's
 * option — as the folded area's header names them (→WEB-60): 데이터 스카우팅 · 균형. A custom
 * ticket price reads 사용자 지정.
 */
export function areaSummary(w: World, area: DirectionArea) {
  const policy = policyOf(w);
  const rows = area.rows.map((key) =>
    isDirectionRow(key)
      ? directionOption(w, key).name
      : key === 'ticket'
        ? (TICKET_LEVELS.find((level) => level.price === w.ticket)?.name ?? '사용자 지정')
        : POLICY_INFO[key].levels[policy[key] - 1].name,
  );
  return [...(area.card ? [cardOf(buildOf(w), area.card).label] : []), ...rows].join(' · ');
}
