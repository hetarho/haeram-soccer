import { expect, type Page } from '@playwright/test';
import { createWorld } from '../../packages/engine/src/index';
import { careerDate } from '../../packages/engine/src/person-careers';
import { importResponsibilityCareer } from './responsibility-fixtures';
/** Marked synthetic career uses the ordinary portable checkpoint/worker boundary. */
export function secondCareerFixture() {
  const w = createWorld({
    country: 'ENG',
    name: 'Synthetic Second Career',
    color: '#224466',
    seed: 'synthetic-second-career',
    level: 'normal',
  });
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
    intention: { at: careerDate(w), draw: 0.55, willing: false },
    retirement: { announced: careerDate(w), year: w.year },
  });
  w.settings!.responsibilities.contracts = 'direct';
  w.settings!.responsibilities.staff = 'direct';
  w.cash = '999999999';
  return { w, player };
}
export async function importSecondCareer(page: Page) {
  const fixture = secondCareerFixture();
  await importResponsibilityCareer(page, fixture.w);
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
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

/** Inspect only the normal download; no private browser mutation or debug bridge. */
export async function exportedCareer(page: Page) {
  const { readFile } = await import('node:fs/promises');
  const { decode } = await import('../../apps/web/src/adapters/persistence');
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴', exact: true });
  const event = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await event;
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return (await decode(await readFile((await file.path())!, 'utf8'))).world;
}

/** Synthetic accepted agreement is made by the same real commands used by the UI. */
export async function combinedCareerFixture() {
  const { operate } = await import('../../packages/engine/src/index');
  const { w, player } = secondCareerFixture();
  operate(w, { type: 'encourage-coaching', player: player.id });
  operate(w, { type: 'propose-playing-coach', player: player.id, years: 2, term: 5 });
  operate(w, { type: 'answer-playing-coach', player: player.id, accept: true });
  return {
    w,
    player: w.players.find((p) => p.id === player.id)!,
    proposal: w.playingCoachProposals![player.id],
  };
}
