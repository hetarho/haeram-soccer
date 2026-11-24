import { expect, it } from 'vitest';
import type { Player, World } from '../../contracts/src/types';
import { activePlayers, clubOf, formationOf } from './player-state';
import { arrivalBase, clubPlayers, ownStarters, startersWithArrival } from './world';
import { world } from './transfers.testkit';

/** What `recruitmentSelection` chose before `startersWithArrival`: the XI on a copied squad. */
const chosenAfresh = (w: World, arriving: Player) =>
  ownStarters({ ...w, players: [...w.players.filter((p) => p.id !== arriving.id), arriving] });
const ids = (players: readonly Player[]) => players.map((p) => p.id);

it('chooses the XI an arrival joins as the whole squad chosen afresh would', () => {
  const w = world();
  const base = arrivalBase(w);
  expect(base.floor).toHaveLength(formationOf(w.tactic).length);
  const starters = ownStarters(w);
  const others = w.clubs
    .filter((club) => club.id !== w.playerClub)
    .slice(0, 12)
    .flatMap((club) => clubPlayers(w, club));
  const arrivals: Player[] = [
    ...others,
    // A starter's equal under another id ties at his slot, winning it on a lower id; a stronger
    // one takes it.
    ...starters.map((p) => ({ ...p, id: `${p.id}-twin` })),
    ...starters.map((p) => ({ ...p, id: ` ${p.id}` })),
    ...starters.map((p) => ({ ...p, id: `${p.id}-fresh`, fatigue: 0, adaptation: 1 })),
    // An injured star stays out while eleven are fit; a returning player replaces his own row.
    { ...starters[0]!, id: 'injured-star', injury: { year: w.year, day: 400, label: 'test' } },
    { ...activePlayers(w).at(-1)!, fatigue: 0 },
  ];
  let kept = 0;
  for (const arriving of arrivals) {
    const after = startersWithArrival(w, arriving, base);
    expect(ids(after), arriving.id).toEqual(ids(chosenAfresh(w, arriving)));
    if (!after.some((p) => p.id === arriving.id)) kept++;
  }
  // Both answers are read: arrivals left out of the XI and arrivals who make it.
  expect(kept).toBeGreaterThan(0);
  expect(kept).toBeLessThan(arrivals.length);
  // A base read of another world is never used.
  const later: World = { ...w, year: w.year + 1 };
  expect(ids(startersWithArrival(later, others[0]!, base))).toEqual(
    ids(chosenAfresh(later, others[0]!)),
  );
  expect(clubOf(w).id).toBe(w.playerClub);
});
