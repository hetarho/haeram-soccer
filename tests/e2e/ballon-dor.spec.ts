import { expect, test } from '@playwright/test';
import type { BallonDorPlace } from '../../packages/contracts/src/types';
import { simulatedWorld } from '../fixtures/worlds';
import { openClubRecords } from './competition-navigation';
import { horizontalOverflow } from './layout';
import { continueSlot, seedSlot } from './slots';

test('browses the Ballon d’Or podium with our player marked and on his sheet (→WEB-111)', async ({
  page,
}) => {
  // One simulated season carries the podium; the award itself is the engine's from 1955/56. The
  // season comes from the world cache (→ARCH-21), lived once per engine source.
  test.setTimeout(120_000);
  const w = simulatedWorld({ country: 'ENG', seed: 'ballon-dor-journey' }, { seasons: 1 });
  const star = w.players.find((p) => p.status === 'active')!;
  const rival = w.clubs.find((club) => club.id !== w.playerClub && club.tier === 0)!;
  const place = (id: string, name: string, club: string, points: number): BallonDorPlace => ({
    id,
    name,
    club,
    position: 'ST',
    goals: 30,
    assists: 10,
    appearances: 40,
    points,
    honours: ['league'],
  });
  w.history.at(-1)!.ballonDor = [
    place(star.id, star.name, w.playerClub, 190),
    place('rival-star', 'Rival Star', rival.id, 150),
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSlot(page, w);
  await page.goto('/');
  await continueSlot(page);
  await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1951');
  await page.keyboard.press('Escape');
  await openClubRecords(page);
  await page.getByRole('tab', { name: '발롱도르', exact: true }).click();
  await expect(page).toHaveURL(/view=ballonDor/);
  const podium = page.getByRole('table', { name: '발롱도르 순위', exact: true });
  await expect(podium.locator('tbody tr').first()).toContainText(star.name);
  await expect(podium.locator('tbody tr').first()).toContainText('우리 팀');
  await expect(podium).toContainText('Rival Star');
  // One awarded season: the stepper has nowhere to go either way.
  await expect(
    page.getByRole('button', { name: '이전 발롱도르 시즌', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '다음 발롱도르 시즌', exact: true }),
  ).toBeDisabled();
  expect(await horizontalOverflow(page)).toBe(0);
  // The address keeps the view across a reload (→WEB-74).
  await page.reload();
  await expect(page.getByRole('tab', { name: '발롱도르', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await podium.getByRole('button', { name: `${star.name} 선수 기록`, exact: true }).click();
  await expect(page.getByTestId('ballon-dor-honours')).toHaveText('발롱도르 수상 1회 (1950/51)');
});
