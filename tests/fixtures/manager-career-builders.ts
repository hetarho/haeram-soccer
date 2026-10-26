/** Explicit regeneration only: browser assertions load snapshots instead of running these builders. */
import type { World } from '../../packages/contracts/src/types';
import {
  advanceRound,
  createWorld,
  managerCandidates,
  managerTerm,
  operate,
  simulateSeason,
} from '../../packages/engine/src/index';
import { DISABLED_RELEASE } from './releases';
import { withoutManagerHistory } from './worlds';

const freeManager = (w: World, except: readonly string[] = []) =>
  managerCandidates(w).find((offer) => offer.source === 'free' && !except.includes(offer.id));
function hire(w: World, id: string | undefined) {
  if (!id) throw new Error('no free manager to appoint');
  operate(w, { type: 'hire', id });
}
/** Whole rounds until the own club has settled `n` more matches. */
function playOwnMatches(w: World, n = 1) {
  const target = w.ownMatches.length + n;
  for (let round = 0; round < 12 && w.ownMatches.length < target; round++)
    advanceRound(w, undefined, false);
  if (w.ownMatches.length < target) throw new Error('the own club settled no match in 12 rounds');
}

export function buildManagerJourneyWorld(): World {
  // manager-journey-2 wins the 1950 cup on the released model; manager-journey did before it.
  for (const seed of ['manager-journey-2', 'manager-journey', 'manager-journey-4']) {
    const w = createWorld({
      country: 'ENG',
      name: 'Tenure Journey',
      color: '#2d5a3f',
      seed,
      level: 'easy',
    });
    w.cash = '999999999999';
    for (const player of w.players)
      for (const key of Object.keys(player.attrs) as (keyof typeof player.attrs)[])
        player.attrs[key] = 99;
    const cup = () => w.cups?.find((entry) => entry.country === 'ENG');
    for (let round = 0; round < 46 && !cup()?.winner; round++) advanceRound(w, undefined, false);
    if (cup()?.winner !== w.playerClub) continue;
    // He must still be in charge on the first day of 1951: a one-season school (the firefighter
    // manager-journey-2 offers first on the released model) leaves at the 1950 close instead.
    const closer = managerCandidates(w).find(
      (offer) => offer.source === 'free' && managerTerm(offer) > 1,
    )!;
    hire(w, closer.id);
    simulateSeason(w);
    // The first day of 1951: another manager, then the one he replaced again.
    hire(w, freeManager(w, [closer.id])?.id);
    hire(w, closer.id);
    w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
    operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
    if (!w.manager.interim) throw new Error('the reappointed manager did not resign');
    playOwnMatches(w, 2);
    for (let n = 0; n < 21; n++) {
      hire(w, freeManager(w, [w.manager.id])?.id);
      playOwnMatches(w);
    }
    if (w.critical) throw new Error(`the journey career holds a blocking alert: ${w.critical}`);
    return w;
  }
  throw new Error('no seeded journey career whose founding manager wins the cup');
}

export function buildManagerActivationWorld(): World {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Activation Athletic',
      color: '#4a3b2a',
      seed: 'manager-activation',
      level: 'easy',
    },
    DISABLED_RELEASE,
  );
  w.cash = '999999999999';
  // Every business decision delegated, so the seeded seasons leave no owner answer pending.
  const responsibilities = w.settings!.responsibilities;
  for (const key of Object.keys(responsibilities) as (keyof typeof responsibilities)[])
    responsibilities[key] = 'delegated';
  for (let round = 0; round < 20; round++) advanceRound(w, undefined, false);
  hire(w, freeManager(w)?.id);
  simulateSeason(w);
  if (w.critical) hire(w, freeManager(w)?.id);
  for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
  const world = withoutManagerHistory(w);
  return world;
}
