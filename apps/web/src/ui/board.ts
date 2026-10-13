import type {
  ClubPolicy,
  Command,
  PolicyKey,
  PolicyLevel,
  World,
} from '../../../../packages/contracts/src/types';
import {
  BUILD_SLOTS,
  type BuildSlot,
  type ClubBuild,
} from '../../../../packages/contracts/src/build';
import { buildOf, sameBuild } from '../../../../packages/engine/src/build';
import { POLICY_KEYS, policyOf, policyPreview } from '../../../../packages/engine/src/policy';
import { gateProjection, operatingCosts } from '../../../../packages/engine/src/finance';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { SEASON_ROUNDS } from '../../../../packages/engine/src/calendar';

/**
 * The operating board's draft (→WEB-60): the strategy cards and the dials the owner tapped, kept
 * out of the world until 적용. `name` labels a preset or a saved strategy (→WEB-61) and goes with
 * `build` only.
 */
export type BoardDraft = {
  build?: ClubBuild;
  policy?: Partial<ClubPolicy>;
  ticket?: number;
  name?: string;
};
/** A dial change asked for from elsewhere, such as a cash remedy (→WEB-44); T071's store. */
export type BoardRequest = { policy?: { key: PolicyKey; level: PolicyLevel }; ticket?: number };

export type CardChange = { kind: 'card'; slot: BuildSlot; from?: string; to?: string };
export type PolicyChange = { kind: 'policy'; key: PolicyKey; from: PolicyLevel; to: PolicyLevel };
export type TicketChange = { kind: 'ticket'; from: number; to: number };
export type DraftChange = CardChange | PolicyChange | TicketChange;

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
  return changes;
}

/**
 * The commands 적용 sends, in order: the strategy first (named for a preset or a saved strategy),
 * then one `policy` per changed dial, the ticket last. A draft equal to the world sends nothing.
 */
export function draftCommands(w: World, d: BoardDraft): Command[] {
  const commands: Command[] = [];
  if (d.build && cardChanges(w, d).length)
    commands.push({ type: 'build', build: d.build, ...(d.name ? { name: d.name } : {}) });
  for (const change of draftChanges(w, d))
    if (change.kind === 'policy')
      commands.push({ type: 'policy', key: change.key, level: change.to });
    else if (change.kind === 'ticket') commands.push({ type: 'ticket', price: change.to });
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
  };
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
  return next;
}
/** One card tapped in its area row; the draft's strategy becomes the owner's own mix. */
export function withCard(w: World, d: BoardDraft, slot: BuildSlot, card?: string): BoardDraft {
  const build: ClubBuild = { ...(d.build ?? buildOf(w)) };
  if (card) (build as Record<string, string>)[slot] = card;
  else delete build[slot];
  return tidy(w, { ...d, build, name: undefined });
}
/** A preset or saved strategy tapped: all six cards at once, with its name. */
export function withStrategy(w: World, d: BoardDraft, build: ClubBuild, name?: string) {
  return tidy(w, { ...d, build, name: sameBuild(build, buildOf(w)) ? undefined : name });
}
/** A dial step tapped; the level in force takes the dial out of the draft. */
export function withPolicy(w: World, d: BoardDraft, key: PolicyKey, level: PolicyLevel) {
  return tidy(w, { ...d, policy: { ...d.policy, [key]: level } });
}
/** A ticket preset tapped. */
export function withTicket(w: World, d: BoardDraft, price: number) {
  return tidy(w, { ...d, ticket: price });
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
