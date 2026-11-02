import { expect, test } from '@playwright/test';
import { createWorld, makePlayer } from '../../packages/engine/src/index';
import { retainPerson, openEmployment } from '../../packages/engine/src/person-careers';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import { openPersonnel } from './personnel-navigation';
import { horizontalOverflow, viewGeometry } from './layout';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`places only read, and the academy reviews promotion and release without mutation at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const world = createWorld({
      country: 'ENG',
      name: 'Synthetic Place Requests',
      color: '#224433',
      seed: 'place-requests',
      level: 'easy',
    });
    world.settings!.mode = 'manual';
    world.settings!.observations = { matchEve: false, windowOpen: false };
    world.manager.trust = 50;
    world.morale = 60;
    const prospect = makePlayer(
      'ENG',
      world.seed,
      `${world.playerClub}:academy:${world.year}:0`,
      world.year,
      40,
      'CM',
      17,
    );
    prospect.potential = 74;
    world.academy = { players: [prospect] };
    retainPerson(world, prospect, world.playerClub, true);
    openEmployment(world, prospect.id, 'player', world.playerClub);
    await importResponsibilityCareer(page, world);
    // The manager's office and the coaching room only read (→WEB-102): no requests to send.
    await openPersonnel(page, 'manager');
    const before = await exportedCareer(page);
    await expect(page.getByTestId('place-activities-manager')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '감독에게 요청', exact: true })).toHaveCount(0);

    await openPersonnel(page, 'players');
    await page.getByRole('button', { name: /^선수단 ·/ }).click();
    const culture = page.getByRole('dialog', { name: '선수단 업무 기준', exact: true });
    await expect(culture).toContainText('라커룸 문화');
    await expect(culture).not.toContainText('재계약 기조');
    await page.keyboard.press('Escape');
    await openPersonnel(page, 'coaches');
    await expect(page.getByTestId('place-activities-coaching')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '스태프에게 요청', exact: true })).toHaveCount(0);
    // Training is suggested in 훈련, never from the staff directory (→WEB-71).
    await expect(page.getByRole('button', { name: '훈련 조건 검토', exact: true })).toHaveCount(0);
    await openPersonnel(page, 'training');
    await page.getByRole('button', { name: /^수석코치에게 훈련 제안·강행/ }).click();
    await expect(
      page.getByRole('dialog', { name: '수석코치 훈련 제안', exact: true }),
    ).toContainText('사임');
    await page.keyboard.press('Escape');
    // The training ground reads its state; it has no request panel of its own.
    await expect(page.getByTestId('place-activities-training')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '수석코치에게 훈련 제안·강행', exact: false }),
    ).toHaveCount(1);
    await openPersonnel(page, 'academy');
    const academy = page.getByTestId('place-activities-academy');
    await expect(academy.getByRole('region', { name: '유소년 아카데미', exact: true })).toHaveCount(
      1,
    );
    await academy
      .getByRole('button', { name: `${prospect.name} 승격·방출 검토`, exact: true })
      .click();
    const youth = page.getByRole('dialog', { name: '유소년 승격·방출 검토', exact: true });
    await expect(youth).toContainText('승격 후 연봉');
    await expect(youth).toContainText('남은 성장 기회를 포기');
    await youth.getByRole('button', { name: '취소', exact: true }).click();
    await academy
      .getByRole('button', { name: /^유스 디렉터에게 훈련 제안·강행/ })
      .scrollIntoViewIfNeeded();
    expect(await horizontalOverflow(page)).toBe(0);
    const geometry = await viewGeometry(page);
    expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height);
    expect(await exportedCareer(page)).toEqual(before);
  });
}
