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
  const { decode } = await import('../../apps/web/src/adapters/persistence');
  await dismissMatchReport(page);
  return aroundOffice(page, async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const menu = page.getByRole('dialog', { name: '설정', exact: true });
    const event = page.waitForEvent('download');
    await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
    const file = await event;
    await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    return (await decode(await readFile((await file.path())!, 'utf8'))).world;
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
