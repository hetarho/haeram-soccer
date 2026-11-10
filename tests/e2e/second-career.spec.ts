import { approvalQueue, approvalRequest } from './office';
import { managerCard, openPersonnel } from './personnel-navigation';
import { test, expect } from '@playwright/test';
import { importSecondCareer } from './career-fixtures';
import { horizontalOverflow } from './layout';
import { reviewInOffice } from './events';
test('qualitative-aptitude-visibility', async ({ page }) => {
  await importSecondCareer(page);
  const aptitude = page.getByTestId('profile-aptitude');
  await expect(aptitude).toContainText('코치 자질높음');
  await expect(aptitude).toContainText('감독 자질높음');
  await expect(aptitude).not.toContainText('OVR');
  await expect(aptitude).not.toContainText('4');
  // The sheet reads his aptitude only: the owner neither encourages a coaching career nor drafts
  // a playing-coach contract (→WEB-78, STAFF-25/32).
  await expect(page.getByRole('region', { name: '지도자 진로' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '지도자 진로 권유', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '플레잉 코치 계약안 보기', exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
test('combined-playing-coach-review', async ({ page }) => {
  const { proposedCareerFixture, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { w, player } = await proposedCareerFixture();
  await importResponsibilityCareer(page, w);
  // Staff put the proposal; the owner answers it once in the 결재함 (→STAFF-32, WEB-45).
  await reviewInOffice(page, `${player.name} 플레잉 코치 계약 검토`);
  const review = page.getByRole('region', { name: '선수·코치 통합 계약 검토' });
  await expect(review).toContainText('선수 연봉');
  await expect(review).toContainText('코치 연봉');
  await expect(review).toContainText('합산 연봉');
  await expect(review).toContainText('즉시 지출');
  await expect(review.getByTestId('decision-owner-contracts')).toContainText('직접');
  await expect(review.getByTestId('decision-owner-staff')).toContainText('직접');
  await review.getByRole('button', { name: '선수·코치 계약 함께 승인', exact: true }).click();
  await expect(review).toHaveCount(0);
  const saved = await exportedCareer(page);
  expect(saved.playingCoachProposals![player.id].status).toBe('accepted');
  expect(saved.staff!.filter((s) => s.person === player.id)).toHaveLength(1);
});

test('same-person-cross-role-links', async ({ page }) => {
  const { qualifiedCoachFixture } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { w, player } = await qualifiedCoachFixture('internal');
  await importResponsibilityCareer(page, w);
  await openPersonnel(page, 'players');
  await openPersonnel(page, 'coaches');
  await page.getByRole('button', { name: `${player.name} 인물 경력`, exact: true }).click();
  let detail = page.getByRole('dialog', { name: '인물 경력', exact: true });
  await expect(detail).toContainText(player.name);
  await expect(detail).toContainText(`${player.born}년생`);
  await expect(detail).toContainText('3년 근무 충족');
  await detail.getByRole('button', { name: '닫기', exact: true }).last().click();
  await openPersonnel(page, 'manager');
  // The staff share 코치진 with the manager, so his card holds the replacement (→WEB-43).
  await managerCard(page).getByRole('button', { name: '교체', exact: true }).click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: player.name, exact: true }) });
  await expect(card).toContainText('내부 승진');
  await card.getByRole('button', { name: /^감독 선임 ·/ }).click();
  const confirm = page.getByRole('dialog', { name: '감독 선임 확인' });
  await confirm.getByRole('button', { name: '선임 확정', exact: true }).click();
  // The appointment closes the confirmation and the market, whose candidate card links the same
  // person; his history then opens from the current manager's card, which now names him.
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '감독 교체' })).toHaveCount(0);
  const history = managerCard(page).getByRole('button', {
    name: `${player.name} 인물 경력`,
    exact: true,
  });
  await expect(history).toBeVisible();
  await history.click();
  detail = page.getByRole('dialog', { name: '인물 경력', exact: true });
  await expect(detail).toContainText(`${player.born}년생`);
  await expect(detail).toContainText('감독 능력');
  await expect(detail).toContainText('코치 능력');
});
test('employed-coach-manager-quote', async ({ page }) => {
  const { qualifiedCoachFixture } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { w, player } = await qualifiedCoachFixture('club');
  await importResponsibilityCareer(page, w);
  await openPersonnel(page, 'players');
  await openPersonnel(page, 'manager');
  await managerCard(page).getByRole('button', { name: '교체', exact: true }).click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: player.name, exact: true }) });
  await expect(card).toContainText('타 구단 코치 재직 중');
  await expect(card).toContainText('보상금');
  await card.getByRole('button', { name: /^데려오기 ·/ }).click();
  const confirm = page.getByRole('dialog', { name: '감독 선임 확인' });
  await expect(confirm).toContainText('즉시 지출');
  await expect(confirm).toContainText('계약금');
  await expect(confirm).toContainText('보상금');
  await expect(confirm).toContainText('코치 자리와 연봉은 끝나고');
});

for (const width of [1280, 390]) {
  test(`combined approval survives reload and portable import at ${width}px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const { proposedCareerFixture, exportedCareer } = await import('./career-fixtures');
    const { importResponsibilityCareer } = await import('./responsibility-fixtures');
    const { w, player } = await proposedCareerFixture();
    await importResponsibilityCareer(page, w);
    await reviewInOffice(page, `${player.name} 플레잉 코치 계약 검토`);
    const review = page.getByRole('region', { name: '선수·코치 통합 계약 검토' });
    await review.getByRole('button', { name: '선수·코치 계약 함께 승인', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    const before = await exportedCareer(page),
      id = player.id,
      person = before.people![id];
    expect(before.playingCoachProposals![id].status).toBe('accepted');
    expect(before.staff!.filter((s) => s.person === id)).toHaveLength(1);
    expect(person.qualities).toEqual(player.qualities);
    expect(person.intention).toMatchObject({ draw: 0.45, willing: true });
    expect(person.intention).not.toHaveProperty('encouraged');
    await page.reload();
    const after = await exportedCareer(page);
    expect(after.people![id]).toEqual(person);
    expect(after.cash).toBe(before.cash);
    expect(after.playingCoachProposals![id]).toEqual(before.playingCoachProposals![id]);
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    try {
      const imported = await context.newPage();
      const { importResponsibilityCareer } = await import('./responsibility-fixtures');
      await importResponsibilityCareer(imported, after);
      const restored = await exportedCareer(imported);
      expect(restored.people![id]).toEqual(person);
      expect(restored.cash).toBe(before.cash);
      expect(restored.staff!.filter((s) => s.person === id)).toHaveLength(1);
    } finally {
      await context.close();
    }
  });
}

test('coach-only dismissal preserves the playing contract through reload', async ({ page }) => {
  const { combinedCareerFixture, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { STAFF_INFO } = await import('../../packages/engine/src/staff');
  const { w, player, proposal } = await combinedCareerFixture();
  await importResponsibilityCareer(page, w);
  await openPersonnel(page, 'players');
  await openPersonnel(page, 'coaches');
  const department = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: `${player.name} 인물 경력`, exact: true }) });
  await department.getByRole('button', { name: '교체', exact: true }).click();
  await page
    .getByRole('dialog', { name: `${STAFF_INFO[proposal.role].label} 선임`, exact: true })
    .getByRole('button', { name: /^계약 해지/ })
    .click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const after = await exportedCareer(page);
  expect(after.players.find((p) => p.id === player.id)).toMatchObject({
    status: 'active',
    wage: player.wage,
    until: player.until,
    retiring: player.retiring,
  });
  expect(after.staff!.some((s) => s.person === player.id)).toBe(false);
  expect(after.people![player.id].employment.filter((j) => !j.to).map((j) => j.role)).toEqual([
    'player',
  ]);
  await page.reload();
  expect((await exportedCareer(page)).people![player.id]).toEqual(after.people![player.id]);
});

// The mixed pairs are covered in the engine (`playing-coach.test.ts`); the journey keeps one
// direct and one delegated pair (T786).
for (const contracts of ['direct', 'delegated'] as const)
  for (const staff of [contracts] as const)
    test(`joint contract authority ${contracts}/${staff} remains atomic`, async ({ page }) => {
      // The career is 35 rounds on before the page opens; with the own league on the grid engine
      // (T218) those rounds alone take about 23 s on CI when the world cache is cold, so slow CI
      // browsers need longer.
      test.slow();
      const { secondCareerRoundsOn, exportedCareer } = await import('./career-fixtures');
      const { importResponsibilityCareer } = await import('./responsibility-fixtures');
      const { stagePlayingCoach } = await import('../../packages/engine/src/testing');
      const { configureResponsibilities } = await import('./events');
      const { playerWorth } = await import('../../packages/engine/src/contracts');
      const { w, player } = secondCareerRoundsOn();
      player.qualities = { understanding: 5, teaching: 5, judgement: 5 };
      player.personality.professionalism = 5;
      Object.assign(w.people![player.id], {
        qualities: { ...player.qualities },
        professionalism: 5,
        // Willing by his own draw: 매우 높음 below 0.8 (→STAFF-25).
        intention: { at: { year: w.year, day: w.calendar!.day }, draw: 0.75, willing: true },
      });
      w.income = w.cash;
      // The conversion follows the ordinary contract rule (→STAFF-32): 재계약 기조 표준 keeps a
      // player at most at 110% of his market wage (→CLUB-26). The taken-over squad's veteran, made
      // 35 above, still drew a younger man's wage beyond it, so he is paid what the market pays him.
      const veteran = w.players.find((p) => p.id === player.id)!;
      veteran.wage = playerWorth(w, veteran);
      w.settings!.responsibilities.contracts = contracts;
      w.settings!.responsibilities.staff = staff;
      // Staff put the conversion as they would on filling his post (→STAFF-32).
      stagePlayingCoach(w, player.id, 2, 5);
      const automatic = contracts === 'delegated' && staff === 'delegated';
      const proposal = w.playingCoachProposals![player.id];
      expect(proposal.status).toBe(automatic ? 'accepted' : 'pending');
      await importResponsibilityCareer(page, w);
      const before = await exportedCareer(page);
      expect(before.staff!.some((s) => s.person === player.id)).toBe(automatic);
      if (!automatic)
        await configureResponsibilities(page, {
          responsibilities: { contracts: 'delegated', staff: 'delegated' },
        });
      const after = await exportedCareer(page);
      expect(after.playingCoachProposals![player.id].status).toBe('accepted');
      expect(after.staff!.filter((s) => s.person === player.id)).toHaveLength(1);
      expect(BigInt(after.cash)).toBe(
        BigInt(before.cash) - (automatic ? 0n : BigInt(proposal.upfront)),
      );
      await page.reload();
      expect((await exportedCareer(page)).cash).toBe(after.cash);
    });

test('synthetic two playing-coach years plus full-time service excludes unemployment and crosses the exact day', async ({
  browser,
}) => {
  const { qualifiedCoachFixture, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { prepareSeason } = await import('../../packages/engine/src/season');
  const { qualifyManagers } = await import('../../packages/engine/src/manager-entry');
  const { coachingService } = await import('../../packages/engine/src/person-careers');
  for (const kind of ['unemployed', 'below', 'qualified'] as const) {
    const { w, player, person } = await qualifiedCoachFixture('internal');
    delete person.management;
    const role = person.coaching!.role;
    person.employment = [
      {
        role: 'player',
        club: w.playerClub,
        from: { year: 1950, day: 0 },
        to: { year: 1952, day: 0 },
      },
      { role, club: w.playerClub, from: { year: 1950, day: 0 }, to: { year: 1952, day: 0 } },
      ...(kind === 'unemployed'
        ? []
        : [{ role, club: w.playerClub, from: { year: 1953, day: kind === 'below' ? 1 : 0 } }]),
    ];
    person.mentors = [];
    if (kind === 'unemployed') w.staff = w.staff!.filter((s) => s.person !== player.id);
    w.year = kind === 'unemployed' ? 1953 : 1954;
    w.manager.until = w.year + 3;
    prepareSeason(w);
    qualifyManagers(w);
    const service = coachingService(person, { year: w.year, day: 0 });
    expect(service.days).toBe(kind === 'unemployed' ? 731 : kind === 'below' ? 1095 : 1096);
    expect(!!person.management).toBe(kind === 'qualified');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await importResponsibilityCareer(page, w);
      const restored = await exportedCareer(page);
      expect(restored.people![player.id].employment).toEqual(person.employment);
      expect(!!restored.people![player.id].management).toBe(kind === 'qualified');
    } finally {
      await context.close();
    }
  }
});

test('playing retirement retains the unexpired coach job at the real season close', async ({
  page,
}) => {
  // Nearly three seasons are lived first; with the own league on the grid engine (T218) they take
  // about 30 s before the page opens when the world cache is cold.
  test.setTimeout(180000);
  const { retiringCombinedCareer, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { finishSeason } = await import('./season-progression');
  // Synthetic announced candidate; the following seasons and retirement use real lifecycle code.
  const { w, player, proposal } = retiringCombinedCareer();
  await importResponsibilityCareer(page, w);
  await finishSeason(page);
  const after = await exportedCareer(page);
  expect(after.players.find((p) => p.id === player.id)?.status).toBe('retired');
  expect(after.staff!.find((s) => s.person === player.id)?.role).toBe(proposal.role);
  expect(after.people![player.id].employment.filter((j) => !j.to).map((j) => j.role)).toContain(
    proposal.role,
  );
  expect(after.people![player.id].employment.filter((j) => !j.to).map((j) => j.role)).not.toContain(
    'player',
  );
});

test('a disclosed player departure ends both jobs and charges coach compensation once', async ({
  page,
}) => {
  const { combinedCareerFixture, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { prepareSeason } = await import('../../packages/engine/src/season');
  const { pushInbox } = await import('../../packages/engine/src/inbox');
  const { playingCoachDepartureCost } = await import('../../packages/engine/src/playing-coach');
  const { w, player } = await combinedCareerFixture();
  w.year++;
  prepareSeason(w);
  const club = w.clubs.find((c) => c.id !== w.playerClub)!.id;
  const bid = {
    id: 'synthetic-dual-departure',
    direction: 'in' as const,
    playerId: player.id,
    club,
    fee: '9999999',
    year: w.year,
    day: 0,
    due: 5,
    status: 'pending' as const,
  };
  w.bids = [bid];
  pushInbox(w, {
    kind: 'incoming-bid',
    title: 'Synthetic combined departure',
    detail: 'Marked synthetic offer using the ordinary sale command.',
    attention: true,
    ref: bid.id,
  });
  const owed = playingCoachDepartureCost(w, player.id);
  await importResponsibilityCareer(page, w);
  await reviewInOffice(page, '선수·코치 계약 종료 검토');
  await expect(approvalRequest(page)).toContainText('코치 계약도 함께 종료');
  await expect(approvalRequest(page)).toContainText('기존 계약 종료 비용');
  await approvalRequest(page).getByRole('button', { name: '수락하고 매각', exact: true }).click();
  // The answered review returns to the 결재함, and exporting comes back to it (→WEB-100).
  await expect(approvalQueue(page)).toBeVisible();
  await expect(approvalRequest(page)).toHaveCount(0);
  const after = await exportedCareer(page);
  await expect(approvalQueue(page)).toBeVisible();
  expect(BigInt(after.cash)).toBe(BigInt(w.cash) + BigInt(bid.fee) - BigInt(owed));
  expect(after.people![player.id].club).toBe(club);
  expect(after.staff!.some((s) => s.person === player.id)).toBe(false);
  expect(after.people![player.id].employment.filter((j) => !j.to).map((j) => j.role)).toEqual([
    'player',
  ]);
  await page.reload();
  expect((await exportedCareer(page)).cash).toBe(after.cash);
});
