import { expect, test } from '@playwright/test';
import { createWorld, makePlayer } from '../../packages/engine/src/index';
import { careOffer, effectText } from '../../packages/engine/src/care';
import { retainPerson, openEmployment } from '../../packages/engine/src/person-careers';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { exportedCareer } from './career-fixtures';
import { openPersonnel } from './personnel-navigation';
import { closeOutcome } from './events';
import { horizontalOverflow, settle, viewGeometry } from './layout';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`place requests disclose trade-offs, cancel without mutation, and retain engine results at ${viewport.width}`, async ({
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
    await openPersonnel(page, 'manager');
    const activities = page.getByTestId('place-activities-manager');
    const before = await exportedCareer(page);
    const offer = careOffer(before, 'backing');
    const trigger = activities.getByRole('button', { name: `${offer.label} 검토`, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const review = page.getByRole('dialog', { name: `${offer.label} 검토`, exact: true });
    for (const outcome of offer.outcomes) await expect(review).toContainText(effectText(outcome));
    await expect(review).toContainText('분위기 −2');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(await exportedCareer(page)).toEqual(before);
    await trigger.click();
    const submit = review.getByRole('button', { name: '요청하기', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await settle(page);
    const target = await submit.boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.y + target!.height).toBeLessThanOrEqual(viewport.height);
    await submit.click();
    await expect(review).toHaveCount(0);
    await closeOutcome(page, '구단주 요청을 전했어요');
    await expect(activities.getByLabel('이 장소의 실제 기록')).toContainText(offer.label);
    const backed = await exportedCareer(page);
    expect(backed.manager.trust).toBe(before.manager.trust + 8);
    expect(backed.morale).toBe(before.morale! - 2);
    expect(backed.cash).toBe(before.cash);
    await trigger.click();
    await expect(review).toContainText('라운드 뒤 다시 가능');
    await expect(submit).toBeDisabled();
    await page.keyboard.press('Escape');

    await openPersonnel(page, 'players');
    await page.getByRole('button', { name: /^선수단 ·/ }).click();
    const culture = page.getByRole('dialog', { name: '선수단 업무 기준', exact: true });
    await expect(culture).toContainText('라커룸 문화');
    await expect(culture).not.toContainText('재계약 기조');
    await page.keyboard.press('Escape');
    await openPersonnel(page, 'coaches');
    const coaching = page.getByTestId('place-activities-coaching');
    await expect(coaching).toContainText('회복 집중 지원');
    await expect(coaching).toContainText('팀 빌딩 데이');
    await coaching.getByRole('button', { name: '훈련 조건 검토', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: '수석코치 훈련 제안', exact: true }),
    ).toContainText('사임');
    await page.keyboard.press('Escape');
    await openPersonnel(page, 'training');
    const training = page.getByTestId('place-activities-training');
    const rest = careOffer(backed, 'rest-day');
    await training.getByRole('button', { name: `${rest.label} 검토`, exact: true }).click();
    const restReview = page.getByRole('dialog', { name: `${rest.label} 검토`, exact: true });
    await expect(restReview).toContainText('피로 −6');
    await expect(restReview).toContainText('분위기 −2');
    await restReview.getByRole('button', { name: '취소', exact: true }).click();
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
    expect(await exportedCareer(page)).toEqual(backed);
  });
}
