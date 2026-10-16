import { describe, expect, it } from 'vitest';
import type { World, Player, TransferBid } from '../../contracts/src/types';
import { validateWorld, canonical } from '../../contracts/src/index';
import {
  createWorld,
  activePlayers,
  makePlayer,
  ownStarters,
  respondBid,
  staffSignings,
  noteSigning,
  advanceRound,
  closeSeason,
} from './index';
import { currentDay } from './calendar';
import { movePerson } from './npc-continuity';
import { openNeed, openNeeds } from './replacements';
import { lineOf } from './player';
function world(count = 20) {
  const w = createWorld({
    country: 'ENG',
    name: 'Replacement Rovers',
    color: '#224433',
    seed: 'replacement-needs',
    level: 'easy',
  });
  w.cash = w.income = '999999999999';
  w.calendar = { day: 1 };
  w.settings!.responsibilities.recruitment = 'delegated';
  while (activePlayers(w).length < count) {
    const p = makePlayer('ENG', w.seed, `bench:${w.players.length}`, w.year, 1, 'CM', 20);
    p.until = w.year + 5;
    w.players.push(p);
    movePerson(w, p, w.playerClub, true);
  }
  return w;
}
function sell(w: World, p: Player) {
  const bid: TransferBid = {
    id: `sale:${p.id}`,
    direction: 'in',
    playerId: p.id,
    club: w.clubs.find((c) => c.id !== w.playerClub && !c.representative)!.id,
    fee: '100000',
    year: w.year,
    day: currentDay(w),
    due: currentDay(w) + 3,
    status: 'pending',
  };
  (w.bids ??= []).push(bid);
  respondBid(w, bid.id, true);
}
describe('replacement needs', () => {
  it('opens for a starter sold from twenty-four and pursues the next day outside the weekly gate', () => {
    const w = world(24),
      starter = ownStarters(w).find((p) => p.position !== 'GK')!;
    sell(w, starter);
    expect(openNeeds(w)).toMatchObject([
      { playerId: starter.id, line: lineOf(starter.position), day: 1 },
    ]);
    w.calendar!.day = 2;
    // Synthetic settled-revenue sample for the ordinary wage-bill check.
    w.round = 1;
    staffSignings(w);
    expect(w.bids!.some((bid) => bid.staff === 'replacement' && bid.day === 2)).toBe(true);
  });
  it('does not replace a bench departure from twenty-two, but replaces one leaving nineteen', () => {
    const rich = world(22),
      starters = new Set(ownStarters(rich).map((p) => p.id));
    sell(
      rich,
      activePlayers(rich).find((p) => !starters.has(p.id))!,
    );
    expect(openNeeds(rich)).toEqual([]);
    const thin = world(),
      ids = new Set(ownStarters(thin).map((p) => p.id));
    sell(
      thin,
      activePlayers(thin).find((p) => !ids.has(p.id))!,
    );
    expect(activePlayers(thin)).toHaveLength(19);
    expect(openNeeds(thin)).toHaveLength(1);
  });
  it.each([false, true])('closes only the oldest same-line need on a signing (loan %s)', (loan) => {
    const w = world(),
      a = activePlayers(w).find((p) => p.position !== 'GK')!,
      b = activePlayers(w).find((p) => p.id !== a.id && lineOf(p.position) === lineOf(a.position))!;
    openNeed(w, a);
    w.calendar!.day = 2;
    openNeed(w, b);
    const incoming = makePlayer('ENG', w.seed, 'new-signing', w.year, 30, a.position, 20);
    if (loan) incoming.loanUntil = w.year + 1;
    w.players.push(incoming);
    noteSigning(w, incoming);
    expect(openNeeds(w).map((need) => need.playerId)).toEqual([b.id]);
  });
  it('reports owner-held recruitment without buying and preserves needs through validation', () => {
    const w = world(24);
    w.settings!.responsibilities.recruitment = 'direct';
    const p = ownStarters(w).find((p) => p.position !== 'GK')!;
    sell(w, p);
    expect(w.inbox?.at(-1)?.detail).toContain('대체 영입 필요');
    const before = canonical(w.players);
    w.calendar!.day = 2;
    staffSignings(w);
    expect(canonical(w.players)).toBe(before);
    expect(validateWorld(JSON.parse(canonical(w))).replacementNeeds).toEqual(w.replacementNeeds);
  });
  it('opens a summer need for an expiring starter after the close top-up', () => {
    const w = world();
    w.settings!.responsibilities.recruitment = 'direct';
    while (w.round < 46) advanceRound(w, undefined, false);
    for (const p of activePlayers(w)) {
      p.until = w.year + 5;
      p.born = w.year - 22;
      w.people![p.id].born = p.born;
    }
    const starter = ownStarters(w)[3];
    starter.until = w.year + 1;
    const year = w.year;
    closeSeason(w);
    expect(activePlayers(w).length).toBeGreaterThanOrEqual(20);
    expect(openNeeds(w)).toContainEqual({
      playerId: starter.id,
      line: lineOf(starter.position),
      year: year + 1,
      window: 'summer',
      day: 0,
    });
  });
});
