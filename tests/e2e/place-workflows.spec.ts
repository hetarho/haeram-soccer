import { expect, test } from '@playwright/test';
import { makePlayer } from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { retainPerson, openEmployment } from '../../packages/engine/src/person-careers';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import { openPersonnel } from './personnel-navigation';
import { horizontalOverflow, viewGeometry } from './layout';

// No CSS rule falls between 360 and 390 px or 740 and 844 px on this screen, so a fit at 360x740
// implies one at 390x844 (T786).
for (const viewport of [
  { width: 360, height: 740 },
  { width: 1280, height: 900 },
]) {
  test(`places only read, and the academy reviews promotion and release without mutation at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const world = careerWorld({ country: 'ENG', seed: 'place-requests' });
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
    // The squad's culture reads as founded beside the roster; nothing opens an editor (→ECON-25).
    const culture = page
      .getByTestId('direction-areas')
      .getByRole('region', { name: '선수단', exact: true });
    await expect(culture).toContainText('라커룸 문화');
    await expect(culture).not.toContainText('재계약 기조');
    await expect(page.getByRole('button', { name: /^선수단 ·/ })).toHaveCount(0);
    await openPersonnel(page, 'coaches');
    await expect(page.getByTestId('place-activities-coaching')).toHaveCount(0);
    await expect(page.getByRole('region', { name: '스태프에게 요청', exact: true })).toHaveCount(0);
    // The coaches set training by their own rules: no training choice anywhere (→WEB-70).
    await expect(page.getByRole('button', { name: '훈련 조건 검토', exact: true })).toHaveCount(0);
    await openPersonnel(page, 'training');
    await expect(page.getByTestId('training-focus')).toContainText('· 코치 판단');
    // The training ground reads its state; it has no request panel of its own.
    await expect(page.getByTestId('place-activities-training')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
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
    await expect(academy.getByRole('button', { name: /훈련 제안·강행/ })).toHaveCount(0);
    await academy.getByTestId('youth-focus').scrollIntoViewIfNeeded();
    expect(await horizontalOverflow(page)).toBe(0);
    const geometry = await viewGeometry(page);
    expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height);
    expect(await exportedCareer(page)).toEqual(before);
  });
}
