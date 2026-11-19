import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import {
  activePlayers,
  advanceDays,
  currentDay,
  managerOffers,
  managerCandidates,
  prepareSeason,
  transferWindowDays,
  operate,
  seasonDayOf,
  simulateSeason,
  talksRound,
  transferOffers,
} from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { joinFreeAgents } from '../../packages/engine/src/free-agents';
import { judgePromises } from '../../packages/engine/src/promises';
import { signingVerdict } from '../../packages/engine/src/signings';
import { recruitmentPreview } from '../../packages/engine/src/recruitment';
import { scoutReach } from '../../packages/engine/src/scout-search';
import { clubOf, overall } from '../../packages/engine/src/player-state';
import { careerDate, careerOrdinal } from '../../packages/engine/src/person-careers';
import type { World } from '../../packages/contracts/src/types';
import { ratio } from '../../packages/engine/src/primitives';
import { detectMediations, resolveMediation } from '../../packages/engine/src/mediation';
import { lineOf } from '../../packages/engine/src/player';
import { staffAuthority } from '../../packages/engine/src/testing';
import { worldMarketPage } from '../../packages/engine/src/world-market';
import { encode } from '../../apps/web/src/adapters/persistence';
import { cachedWorld } from '../fixtures/worlds';
import { startFlow } from './start';

const SELF = fileURLToPath(import.meta.url);

/** A portable checkpoint built through actual bid and settlement commands, never DOM state edits. */
export function pendingAcquisitionCareer() {
  const w = careerWorld({ country: 'ENG', seed: 'responsibility-pending' });
  w.cash = w.income = '999999999999';
  const settings = structuredClone(w.settings!);
  settings.responsibilities.staff = 'direct';
  settings.responsibilities.sales = 'delegated';
  operate(w, { type: 'settings', settings });
  const offers = transferOffers(w);
  for (let candidate = 0; candidate < offers.length; candidate++) {
    const offer = offers[candidate];
    if (!offer.available || offer.freeAgent || BigInt(offer.fee) <= 0n) continue;
    operate(w, { type: 'bid', candidate, fee: ratio(offer.fee, 8n, 10n) });
  }
  for (let day = 0; day < 4; day++) advanceDays(w, 1, undefined, false);
  const counters = (w.bids || []).filter(
    (bid) => bid.direction === 'out' && bid.status === 'countered',
  );
  expect(counters.length).toBeGreaterThanOrEqual(2);
  for (const bid of counters.slice(2))
    operate(w, { type: 'respond-bid', id: bid.id, accept: false });
  expect(w.bids?.filter((bid) => bid.status === 'countered')).toHaveLength(2);
  return w;
}
export async function importResponsibilityCareer(page: Page, world: World) {
  await page.goto('/');
  await expect(startFlow(page)).toBeVisible();
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'responsibilities.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(world, 1, 0)),
    });
  // A 35-round career on the released model: CI WebKit 40233059787 opened it in over 5 s.
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 15000 });
}

/*
 * Careers the journeys live in Node before the page opens. Those that play a season or half of one
 * take tens of seconds, so they come from the world cache (→ARCH-21): built once per engine source
 * and shared by every case and run that asks for the same one, each call returning its own copy.
 */

/** Recruitment answered directly, in manual mode, with no cash: the manager's MF request open. */
export function mediationCareer() {
  const w = careerWorld({ country: 'ENG', seed: 'synthetic-mediation' });
  w.settings!.responsibilities.recruitment = 'direct';
  w.settings!.mode = 'manual';
  w.settings!.observations.matchEve = true;
  w.cash = '0';
  askForSigning(w, 'MF');
  return w;
}
/** Release actual eligible outside-club keepers through the ordinary identity/market API. */
function releasePromiseGoalkeepers(w: World) {
  const reach = scoutReach(w),
    country = clubOf(w).country;
  const candidates = w.clubs
    .flatMap((club) => {
      if (club.id === w.playerClub || club.representative || club.country !== country) return [];
      const squad = w.squads?.[club.id] ?? [];
      if (squad.filter((player) => player.position === 'GK').length < 2) return [];
      return squad
        .filter((player) => {
          const age = w.year - player.born,
            level = overall(player),
            person = w.people?.[player.id];
          return (
            player.position === 'GK' &&
            player.status === 'active' &&
            !player.loanUntil &&
            !player.retiring &&
            person?.club === club.id &&
            person.playing === 'active' &&
            age >= reach.age[0] &&
            age <= reach.age[1] &&
            level >= reach.ability[0] &&
            level <= reach.ability[1]
          );
        })
        .map((player) => ({ player, club: club.id }));
    })
    .sort((a, b) => overall(a.player) - overall(b.player) || (a.player.id < b.player.id ? -1 : 1));
  const origins = new Set<string>();
  for (const { player, club } of candidates) {
    if (origins.has(club)) continue;
    expect(joinFreeAgents(w, player, w.year)).toBe(true);
    expect(w.people![player.id].club).toBeUndefined();
    expect(w.squads![club].some((one) => one.id === player.id)).toBe(false);
    origins.add(club);
    if (origins.size === 2) break;
  }
  expect(origins.size).toBe(2);
}

/** The actual owner-market row, independent of the scout's two recommended places. */
export function promiseFreeAgent(w: World, pick?: string) {
  return worldMarketPage(w, { world: w.id, line: 'GK', sort: 'fee', direction: 'asc' }).items.find(
    (offer) =>
      offer.available &&
      offer.freeAgent &&
      lineOf(offer.player.position) === 'GK' &&
      offer.player.id !== pick,
  );
}

/** A private post-close market with actual external releases; ordinary fresh careers stay empty. */
export function freeAgentMediationCareer() {
  return cachedWorld(
    'e2e-mediation-post-close-free-agents',
    () => {
      const w = careerWorld({ country: 'ENG', seed: 'synthetic-mediation' });
      w.cash = '999999999999';
      w.settings!.responsibilities.recruitment = 'direct';
      w.settings!.responsibilities.contracts = 'delegated';
      w.settings!.responsibilities.sales = 'delegated';
      w.settings!.observations = { matchEve: false, windowOpen: false };
      simulateSeason(w);
      expect(w.year).toBe(1951);
      releasePromiseGoalkeepers(w);
      w.settings!.mode = 'manual';
      w.settings!.observations.matchEve = true;
      w.cash = '0';
      // The commitment is created by the caller only after this preparation has finished.
      askForSigning(w, 'MF');
      return w;
    },
    { dependencies: [SELF] },
  );
}

/** The complete retained-history scene, prepared before its browser case. */
export function retainedPromiseCareer() {
  return cachedWorld(
    'e2e-mediation-four-status',
    () => {
      const w = freeAgentMediationCareer();
      resolveMediation(w, w.mediations![0].id, 'manager', 'delegated');
      const gk = askForSigning(w, 'GK');
      resolveMediation(w, gk.id, 'manager', 'delegated');
      const free = promiseFreeAgent(w)!;
      expect(free).toBeDefined();
      expect(free.target).toMatchObject({ world: w.id, kind: 'offer', playerId: free.player.id });
      expect(free.fee).toBe('0');
      expect(w.people![free.player.id]).toMatchObject({ playing: 'released' });
      expect(w.people![free.player.id].club).toBeUndefined();
      expect(recruitmentPreview(w, free)).toMatchObject({ eligible: true, affordable: true });
      // The original zero-reserve conflict remains: the owner explicitly signs the fee-free keeper.
      expect(
        signingVerdict(w, free.player, free.fee, 'short', undefined, { freeAgent: free.freeAgent })
          .ok,
      ).toBe(false);
      operate(w, { type: 'recruit', target: free.target });
      w.calendar = { day: transferWindowDays(w.year).winterClose + 1 };
      w.round = Math.floor(w.calendar.day / 7);
      delete w.scorerSeason;
      judgePromises(w);
      w.year++;
      prepareSeason(w);
      w.manager.until = w.year + 3;
      w.cash = '0';
      const pending = askForSigning(w, 'MF');
      resolveMediation(w, pending.id, 'manager', 'delegated');
      w.cash = '999999999999';
      operate(w, { type: 'hire', id: managerCandidates(w)[0].id });
      w.cash = '0';
      const last = askForSigning(w, 'MF');
      resolveMediation(w, last.id, 'manager', 'delegated');
      w.inbox = [];
      w.events = [];
      expect(new Set(w.promises!.map((promise) => promise.status))).toEqual(
        new Set(['pending', 'fulfilled', 'unfulfilled', 'cancelled']),
      );
      expect(w.cash).toBe('0');
      return w;
    },
    { dependencies: [SELF] },
  );
}

/** The manager shortlists the first available player of `line`; the conflict it raises. */
export function askForSigning(w: World, line: 'MF' | 'GK') {
  const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === line)!;
  w.shortlist = {
    year: w.year,
    day: w.calendar!.day,
    entries: [{ playerId: offer.player.id, line }],
    requests: [{ kind: 'short', line, pick: offer.player.id }],
  };
  detectMediations(w);
  return w.mediations!.at(-1)!;
}
/**
 * The mediation resolved for the manager with delegated support, then lived to its promise's
 * deadline (`free`: a GK request instead; `loan`: four days short of it, with a paid loan's counter
 * awaiting the owner's signature, found through the real bid flow). `promise` is the record the
 * resolution made, as the days left it; `loan` is absent when no counter was found.
 */
export function promiseDeadlineCareer(arrival: 'none' | 'loan' | 'free') {
  return cachedWorld(
    `e2e-mediation-promise-deadline-${arrival}`,
    () => {
      const w = arrival === 'free' ? freeAgentMediationCareer() : mediationCareer();
      if (arrival === 'free') {
        w.mediations = [];
        askForSigning(w, 'GK');
      }
      resolveMediation(w, w.mediations![0].id, 'manager', 'delegated');
      const promise = w.promises![0];
      w.cash = '999999999999';
      // This journey advances to a promise deadline; pre-match reporting is covered separately.
      w.settings!.observations.matchEve = false;
      w.settings!.responsibilities.contracts = 'delegated';
      w.settings!.responsibilities.sales = 'delegated';
      // A paid loan must be offered before the deadline and answered through the real bid flow.
      // Prepare a counter awaiting the owner's final signature on deadline day; its eventual
      // acceptance, cost and promise fulfilment still happen through the public browser control.
      const target = careerOrdinal(promise.deadline) - (arrival === 'loan' ? 4 : 0);
      while (careerOrdinal(careerDate(w)) < target) {
        const before = careerOrdinal(careerDate(w));
        advanceDays(w, 1, undefined, false);
        expect(careerOrdinal(careerDate(w))).toBeGreaterThan(before);
      }
      expect(careerOrdinal(careerDate(w))).toBe(target);
      let loan: { id: string; player: string; name: string; fee: string } | undefined;
      // The selling club's reservation is a factor registry (CLUB-18): a bid at or above it is
      // accepted outright, so the search lowers the offer until a club counters it.
      if (arrival === 'loan')
        search: for (const offer of worldMarketPage(w, {
          world: w.id,
          line: promise.target.line,
          sort: 'fee',
          direction: 'asc',
        }).items.filter(
          (one) =>
            one.available &&
            !one.freeAgent &&
            BigInt(one.loanFee) >= 2n &&
            lineOf(one.player.position) === promise.target.line &&
            one.player.id !== promise.target.pick,
        ))
          for (const percent of [80n, 60n, 40n]) {
            const copy = structuredClone(w);
            operate(copy, {
              type: 'bid',
              target: offer.target,
              loan: true,
              fee: ((BigInt(offer.loanFee) * percent) / 100n).toString(),
            });
            advanceDays(copy, 4, undefined, false);
            const bid = copy.bids?.find(
              (bid) => bid.playerId === offer.player.id && bid.loan && bid.status === 'countered',
            );
            if (!bid) continue;
            Object.assign(w, copy);
            loan = {
              id: bid.id,
              player: bid.playerId,
              name: offer.player.name,
              fee: bid.counterFee!,
            };
            break search;
          }
      // Other real winter-window conflicts are explicitly postponed; the original promise stays.
      for (const record of w.mediations!.filter((m) => m.status === 'pending'))
        operate(w, { type: 'resolve-mediation', id: record.id, support: 'director' });
      return { w, promise, loan };
    },
    { dependencies: [SELF], input: arrival },
  );
}

/**
 * A direct-manager career at level 2 whose firefighter, hired on the takeover, has lived a whole
 * season: his unanswered renewal is a real decision, never delegated or acknowledged away.
 */
export function unrenewedFirefighterCareer() {
  return cachedWorld(
    'e2e-unrenewed-firefighter-season',
    () => {
      const w = careerWorld({ country: 'ENG', seed: 'short-contract' });
      w.settings = staffAuthority(2);
      const offer = managerOffers(w).find((offer) => offer.style === 'firefighter')!;
      operate(w, { type: 'hire', id: offer.id });
      simulateSeason(w);
      return w;
    },
    { dependencies: [SELF] },
  );
}

/**
 * A club lived to 1 January 1951 whose owner answers contract talks: one player, alone in his
 * contract's final season and one the manager would fail to talk round, has just asked to renew
 * (→CLUB-27). `newYear` is 1 January's day.
 */
export function contractTalkCareer() {
  return cachedWorld(
    'e2e-contract-talk-new-year',
    () => {
      const w = careerWorld({ country: 'ENG', seed: 'contract-talks-journey' });
      // Isolate contract decisions; ordinary unhappiness and transfer-request reports do not stop
      // time.
      operate(w, {
        type: 'settings',
        settings: {
          ...w.settings!,
          mode: 'manual',
          responsibilities: {
            ...w.settings!.responsibilities,
            contracts: 'direct',
            sales: 'delegated',
            recruitment: 'delegated',
          },
          observations: { matchEve: false, windowOpen: false },
        },
      });
      const newYear = seasonDayOf(w.year, 1, 1);
      advanceDays(w, newYear - 1 - currentDay(w), undefined, false);
      // The journey finds his roster card by name, so it must be the only one with that name.
      const player = activePlayers(w).find(
        (p) =>
          !p.talk &&
          !p.unhappy &&
          !p.loanUntil &&
          p.retiring === undefined &&
          activePlayers(w).filter((q) => q.name === p.name).length === 1 &&
          !talksRound(w, p, { kind: 'renew', demand: '0', floor: '0', year: w.year, day: newYear }),
      )!;
      // This marked synthetic fixture isolates one final-season contract from other January talks.
      for (const other of activePlayers(w))
        if (other.id !== player.id && !other.loanUntil) other.until = w.year + 4;
      player.until = w.year + 1;
      advanceDays(w, 1, undefined, false);
      return { w, playerId: player.id, newYear };
    },
    { dependencies: [SELF] },
  );
}
