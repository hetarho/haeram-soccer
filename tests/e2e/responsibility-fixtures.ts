import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import {
  activePlayers,
  advanceDays,
  currentDay,
  managerOffers,
  operate,
  seasonDayOf,
  simulateSeason,
  talksRound,
  transferOffers,
} from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
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
      const w = mediationCareer();
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
      advanceDays(w, promise.deadline.day - (arrival === 'loan' ? 4 : 0), undefined, false);
      let loan: { id: string; player: string; name: string; fee: string } | undefined;
      if (arrival === 'loan')
        for (const offer of worldMarketPage(w, {
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
        )) {
          const copy = structuredClone(w);
          operate(copy, {
            type: 'bid',
            target: offer.target,
            loan: true,
            fee: ((BigInt(offer.loanFee) * 80n) / 100n).toString(),
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
          break;
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
