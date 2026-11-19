import { fileURLToPath } from 'node:url';
import { openPersonnel } from './personnel-navigation';
import { expect, type Page } from '@playwright/test';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { careerDate } from '../../packages/engine/src/person-careers';
import { advanceRound, operate, simulateSeason } from '../../packages/engine/src/index';
import { stagePlayingCoach } from '../../packages/engine/src/testing';
import { cachedWorld } from '../fixtures/worlds';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { dismissMatchReport } from './events';
import { aroundOffice } from './office';

const SELF = fileURLToPath(import.meta.url);
/** Marked synthetic career uses the ordinary portable checkpoint/worker boundary. */
export function secondCareerFixture() {
  const w = careerWorld({ country: 'ENG', seed: 'synthetic-second-career' });
  const player = w.players.find((p) => p.position === 'CM')!,
    person = w.people![player.id];
  player.born = w.year - 35;
  player.retiring = w.year;
  player.qualities = { understanding: 4, teaching: 4, judgement: 4 };
  player.personality.professionalism = 4;
  Object.assign(person, {
    born: player.born,
    position: player.position,
    qualities: { ...player.qualities },
    professionalism: 4,
    // Willing by his own draw: 높음 below 0.5 (→STAFF-25).
    intention: { at: careerDate(w), draw: 0.45, willing: true },
    retirement: { announced: careerDate(w), year: w.year },
  });
  w.settings!.responsibilities.contracts = 'direct';
  w.settings!.responsibilities.staff = 'direct';
  w.cash = '999999999';
  return { w, player };
}
/**
 * `secondCareerFixture` 35 rounds on, unobserved: the joint-authority journeys' common start. The
 * rounds take tens of seconds, so the world comes from the world cache (→ARCH-21), built once per
 * engine source; every call returns its own copy, holding the veteran as the world does.
 */
export function secondCareerRoundsOn() {
  const { w, id } = cachedWorld(
    'e2e-second-career-35-rounds',
    () => {
      const { w, player } = secondCareerFixture();
      for (let round = 0; round < 35; round++) advanceRound(w, undefined, false);
      return { w, id: player.id };
    },
    { dependencies: [SELF] },
  );
  return { w, player: w.players.find((p) => p.id === id)! };
}
export async function importSecondCareer(page: Page) {
  const fixture = secondCareerFixture();
  await importResponsibilityCareer(page, fixture.w);
  await openPersonnel(page, 'players');
  await page
    .getByRole('button', { name: `${fixture.player.name} 선수 기록`, exact: true })
    .first()
    .click();
  return fixture;
}

export async function qualifiedCoachFixture(kind: 'internal' | 'club') {
  const { closeEmployment, openEmployment } =
    await import('../../packages/engine/src/person-careers');
  const { initializeCoaching } = await import('../../packages/engine/src/coaching-entry');
  const { qualifyManagers } = await import('../../packages/engine/src/manager-entry');
  const { prepareSeason } = await import('../../packages/engine/src/season');
  const { w, player } = secondCareerFixture(),
    person = w.people![player.id];
  player.status = 'retired';
  person.intention!.willing = true;
  closeEmployment(w, player.id, 'player');
  person.playing = 'retired';
  person.retirement!.at = careerDate(w);
  initializeCoaching(w, person);
  const club = kind === 'internal' ? w.playerClub : w.clubs.find((c) => c.id !== w.playerClub)!.id;
  const job = openEmployment(w, player.id, person.coaching!.role, club);
  job.wage = '101';
  job.currency = w.currency;
  job.contractUntil = { year: w.year + 5, day: 0 };
  if (kind === 'internal')
    w.staff = [
      ...(w.staff ?? []).filter((s) => s.role !== person.coaching!.role),
      {
        id: player.id,
        person: player.id,
        role: person.coaching!.role,
        name: player.name,
        born: player.born,
        ability: person.coaching!.ability,
        potential: person.coaching!.potential,
        wage: '101',
        since: w.year,
        until: w.year + 5,
      },
    ];
  w.year += 3;
  w.manager.until = w.year + 3;
  prepareSeason(w);
  qualifyManagers(w);
  return { w, player, person };
}

/**
 * Inspect only the normal download; no private browser mutation or debug bridge. The menu is
 * outside the office, so an export from inside steps out and back (→WEB-39).
 */
export async function exportedCareer(page: Page) {
  const { readFile } = await import('node:fs/promises');
  const { worldOfSaveFile } = await import('../fixtures/save-file');
  await dismissMatchReport(page);
  return aroundOffice(page, async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '설정', exact: true });
    const event = page.waitForEvent('download');
    await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
    const file = await event;
    await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    return worldOfSaveFile(await readFile((await file.path())!));
  });
}

/**
 * Staff's combined proposal for the willing veteran, as they put one when they fill his post
 * (→STAFF-32), waiting in the 결재함 while contracts and staff are direct.
 */
export async function proposedCareerFixture() {
  return proposedCareer();
}
function proposedCareer() {
  const fixture = secondCareerFixture();
  const proposal = stagePlayingCoach(fixture.w, fixture.player.id, 2, 5);
  return { ...fixture, proposal };
}

/** Synthetic accepted agreement: staff's proposal answered by the same command the 결재함 sends. */
export async function combinedCareerFixture() {
  return combinedCareer();
}
function combinedCareer() {
  const { w, player } = proposedCareer();
  operate(w, { type: 'answer-playing-coach', player: player.id, accept: true });
  return {
    w,
    player: w.players.find((p) => p.id === player.id)!,
    proposal: w.playingCoachProposals![player.id],
  };
}

/** Exact combined-role sale scene: real full-price buyer, then ordinary settlement on a copy. */
export async function combinedDepartureFixture(id: string) {
  const { prepareSeason } = await import('../../packages/engine/src/season');
  const { npcOffer } = await import('../../packages/engine/src/npc-market');
  const { playerValue, suitorFor } = await import('../../packages/engine/src/transfers');
  const { clubOf } = await import('../../packages/engine/src/player-state');
  const { currency } = await import('../../packages/catalogs/src/index');
  const { joinFreeAgents } = await import('../../packages/engine/src/free-agents');
  const { retainPerson, openEmployment } = await import('../../packages/engine/src/person-careers');
  const { lineOf, LINE_MINIMUM } = await import('../../packages/engine/src/player');
  const { SQUAD_MINIMUM } = await import('../../packages/engine/src/squad-size');
  const { clubRegistration } = await import('../../packages/engine/src/registration');
  const { playingCoachDepartureCost } = await import('../../packages/engine/src/playing-coach');
  const { canonical, validateWorld } = await import('../../packages/contracts/src/index');
  const { message } = await import('../../packages/contracts/src/messages');
  const fixture = await combinedCareerFixture();
  const { w, player } = fixture;
  w.year++;
  prepareSeason(w);
  const oldFee = '9999999',
    quote = playerValue(w, player),
    unit = currency(clubOf(w).country, w.year).units,
    fullFee = BigInt(quote) < BigInt(unit) ? String(unit) : quote;
  const buyerFor = (fee: string) => suitorFor(w, player, () => 0, fee);
  const oldBuyer = buyerFor(oldFee);
  let fee = oldBuyer ? oldFee : fullFee,
    buyer = oldBuyer ?? buyerFor(fullFee);
  const released: string[] = [];
  if (!buyer) {
    // The unchanged seed's smallest MF vacancy is two real departures, leaving20 and its GKs.
    const club = w.clubs.find((c) => c.id === 'ENG:3:0:13')!;
    const leaving = ['ENG:3:0:13:p:7:109', 'ENG:3:0:13:founding:1950:3'];
    const squad = w.squads![club.id]!;
    expect(
      squad.filter((p) => lineOf(p.position) === lineOf(player.position)).length -
        LINE_MINIMUM[lineOf(player.position)] +
        1,
    ).toBe(leaving.length);
    expect(squad.length - leaving.length).toBeGreaterThanOrEqual(SQUAD_MINIMUM);
    for (const playerId of leaving) {
      const actual = w.squads![club.id]!.find((p) => p.id === playerId)!;
      expect(lineOf(actual.position)).toBe(lineOf(player.position));
      const profile = structuredClone(actual);
      retainPerson(w, actual, club.id);
      openEmployment(w, actual.id, 'player', club.id);
      expect(joinFreeAgents(w, actual, w.year)).toBe(true);
      expect(w.freeAgents!.find((p) => p.id === actual.id)).toMatchObject({
        id: profile.id,
        born: profile.born,
        attrs: profile.attrs,
      });
      released.push(actual.id);
    }
    expect(w.squads![club.id]!.some((p) => p.position === 'GK')).toBe(true);
    const registered = clubRegistration(club, w.year, w.squads![club.id]!);
    expect(registered.total).toBeLessThanOrEqual(registered.ceiling);
    expect(registered.counted).toBeLessThanOrEqual(registered.allowed);
    // Retain the original price if this genuine preparation makes it affordable after all.
    const atOldFee = buyerFor(oldFee);
    fee = atOldFee ? oldFee : fullFee;
    buyer = atOldFee ?? buyerFor(fullFee);
  }
  expect(buyer).toBeDefined();
  const offer = npcOffer(w, buyer!, player, clubOf(w), fee);
  expect(offer).toBeDefined();
  const bid = {
    id,
    direction: 'in' as const,
    playerId: player.id,
    club: buyer!.id,
    fee,
    year: w.year,
    day: 0,
    due: 5,
    status: 'pending' as const,
  };
  w.bids = [bid];
  validateWorld(w);
  const unchanged = canonical(w),
    trial = structuredClone(w),
    at = careerDate(trial),
    owed = playingCoachDepartureCost(w, player.id),
    oldPerson = structuredClone(w.people![player.id]!),
    oldMoves = structuredClone(w.playerRecords?.[player.id]?.moves ?? []),
    eventAt = trial.events.length;
  const oldJobs = oldPerson.employment.filter((job) => !job.to);
  expect(oldJobs).toHaveLength(2);
  operate(trial, { type: 'respond-bid', id: bid.id, accept: true });
  const person = trial.people![player.id]!;
  expect(trial.bids!.find((b) => b.id === bid.id)!.status).toBe('completed');
  expect(trial.players.find((p) => p.id === player.id)!.status).toBe('sold');
  expect(person).toMatchObject({
    id: player.id,
    name: oldPerson.name,
    born: oldPerson.born,
    club: buyer!.id,
  });
  expect(person.employment).toEqual([
    ...oldPerson.employment.map((job) => (job.to ? job : { ...job, to: at })),
    { role: 'player', club: buyer!.id, from: at },
  ]);
  expect(trial.squads![buyer!.id]!.filter((p) => p.id === player.id)).toHaveLength(1);
  expect(trial.staff!.some((member) => member.person === player.id)).toBe(false);
  expect(BigInt(trial.cash)).toBe(BigInt(w.cash) + BigInt(fee) - BigInt(owed));
  expect(trial.playerRecords![player.id]!.moves).toEqual([
    ...oldMoves,
    { ...at, from: w.playerClub, to: buyer!.id, fee },
  ]);
  const severance = trial.events.slice(eventAt).filter((event) => event.kind === 'staff-release');
  expect(severance).toHaveLength(1);
  expect(severance[0]!.amount).toBe(owed);
  expect(playingCoachDepartureCost(trial, player.id)).toBe('0');
  validateWorld(trial);
  const completed = canonical(trial);
  expect(() => operate(trial, { type: 'respond-bid', id: bid.id, accept: true })).toThrow(
    message('copy.transfers.c5ab3adae5'),
  );
  expect(canonical(trial)).toBe(completed);
  expect(canonical(w)).toBe(unchanged);
  console.info(
    JSON.stringify({
      kind: 'combined-departure-scene',
      id,
      seed: w.seed,
      year: w.year,
      currency: w.currency,
      unit,
      oldFee,
      oldBuyer: oldBuyer?.id ?? null,
      quote,
      fee,
      buyer: buyer!.id,
      wage: offer!.wage,
      released,
      compensation: owed,
      settledCash: trial.cash,
      jobs: person.employment,
      move: trial.playerRecords![player.id]!.moves.at(-1),
      originalUnchanged: true,
      replayUnchanged: true,
    }),
  );
  return { ...fixture, bid, compensation: owed };
}

/**
 * The accepted agreement two seasons and 45 rounds on, real lifecycle code throughout, as the
 * playing retirement reaches its season close. The player and the proposal are the agreement's
 * own records as the rounds left them. Nearly three seasons take about 30 s, so the world comes
 * from the world cache (→ARCH-21), built once per engine source; every call returns its own copy.
 */
export function retiringCombinedCareer() {
  return cachedWorld(
    'e2e-combined-career-two-seasons-45-rounds',
    () => {
      const { w, player, proposal } = combinedCareer();
      simulateSeason(w);
      simulateSeason(w);
      for (let round = 0; round < 45; round++) advanceRound(w, undefined, false);
      return { w, player, proposal };
    },
    { dependencies: [SELF] },
  );
}
