import type { Page } from '@playwright/test';
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
