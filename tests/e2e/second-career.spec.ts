import { test, expect } from '@playwright/test';
import { importSecondCareer } from './career-fixtures';
import { horizontalOverflow } from './layout';
test('qualitative-aptitude-visibility', async ({ page }) => {
  await importSecondCareer(page);
  const aptitude = page.getByTestId('profile-aptitude');
  await expect(aptitude).toContainText('코치 자질높음');
  await expect(aptitude).toContainText('감독 자질높음');
  await expect(aptitude).not.toContainText('OVR');
  await expect(aptitude).not.toContainText('4');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
test('once-only-encouragement', async ({ page }) => {
  const { player } = await importSecondCareer(page);
  await expect(page.getByRole('region', { name: '지도자 진로' })).toContainText('채용을 보장하지');
  await page.getByRole('button', { name: '지도자 진로 권유', exact: true }).click();
  await expect(page.getByText('진로 권유 사용 완료', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '지도자 진로 권유', exact: true })).toHaveCount(0);
  await page
    .getByRole('dialog', { name: player.name, exact: true })
    .getByRole('button', { name: '닫기', exact: true })
    .last()
    .click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await page
    .getByRole('button', { name: `${player.name} 선수 기록`, exact: true })
    .first()
    .click();
  await expect(page.getByText('진로 권유 사용 완료', { exact: false })).toBeVisible();
});
test('combined-playing-coach-review', async ({ page }) => {
  await importSecondCareer(page);
  await page.getByRole('button', { name: '지도자 진로 권유', exact: true }).click();
  await page.getByRole('button', { name: '플레잉 코치 계약안 보기', exact: true }).click();
  const review = page.getByLabel('선수·코치 통합 계약 검토');
  await expect(review).toContainText('선수 연봉');
  await expect(review).toContainText('코치 연봉');
  await expect(review).toContainText('합산 연봉');
  await expect(review).toContainText('즉시 지출');
  await expect(
    page.getByRole('region', { name: '지도자 진로' }).getByTestId('decision-owner-contracts'),
  ).toContainText('보고받기');
  await expect(
    page.getByRole('region', { name: '지도자 진로' }).getByTestId('decision-owner-staff'),
  ).toContainText('보고받기');
  await review.getByRole('button', { name: '선수·코치 계약 함께 승인', exact: true }).click();
  await expect(page.getByText('플레잉 코치 계약 승인 완료', { exact: false })).toBeVisible();
  await expect(review).toHaveCount(0);
});

test('same-person-cross-role-links', async ({ page }) => {
  const { qualifiedCoachFixture } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { w, player } = await qualifiedCoachFixture('internal');
  await importResponsibilityCareer(page, w);
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  const tab = (name: string) =>
    page
      .getByRole('tablist', { name: '선수단·스태프 보기' })
      .getByRole('tab', { name, exact: true });
  await tab('스태프').click();
  await page.getByRole('button', { name: `${player.name} 인물 경력`, exact: true }).click();
  let detail = page.getByRole('dialog', { name: '인물 경력', exact: true });
  await expect(detail).toContainText(player.name);
  await expect(detail).toContainText(`${player.born}년생`);
  await expect(detail).toContainText('3년 근무 충족');
  await detail.getByRole('button', { name: '닫기', exact: true }).last().click();
  await tab('감독').click();
  await page.getByRole('button', { name: '교체', exact: true }).click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: player.name, exact: true }) });
  await expect(card).toContainText('내부 승진');
  await card.getByRole('button', { name: /^감독 선임 ·/ }).click();
  await page
    .getByRole('dialog', { name: '감독 선임 확인' })
    .getByRole('button', { name: '선임 확정', exact: true })
    .click();
  await page.getByRole('button', { name: `${player.name} 인물 경력`, exact: true }).click();
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
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page
    .getByRole('tablist', { name: '선수단·스태프 보기' })
    .getByRole('tab', { name: '감독', exact: true })
    .click();
  await page.getByRole('button', { name: '교체', exact: true }).click();
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
    const { player } = await importSecondCareer(page);
    const { exportedCareer } = await import('./career-fixtures');
    await page.getByRole('button', { name: '지도자 진로 권유', exact: true }).click();
    await page.getByRole('button', { name: '플레잉 코치 계약안 보기', exact: true }).click();
    await page
      .getByLabel('선수·코치 통합 계약 검토')
      .getByRole('button', { name: '선수·코치 계약 함께 승인', exact: true })
      .click();
    await expect(page.getByText('플레잉 코치 계약 승인 완료', { exact: false })).toBeVisible();
    await page
      .getByRole('dialog', { name: player.name, exact: true })
      .getByRole('button', { name: '닫기', exact: true })
      .last()
      .click();
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    const before = await exportedCareer(page),
      id = player.id,
      person = before.people![id];
    expect(before.playingCoachProposals![id].status).toBe('accepted');
    expect(before.staff!.filter((s) => s.person === id)).toHaveLength(1);
    expect(person.qualities).toEqual(player.qualities);
    expect(person.intention!.draw).toBe(0.55);
    expect(person.intention!.encouraged).toBeDefined();
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
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page
    .getByRole('tablist', { name: '선수단·스태프 보기' })
    .getByRole('tab', { name: '스태프', exact: true })
    .click();
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

for (const contracts of ['direct', 'delegated'] as const)
  for (const staff of ['direct', 'delegated'] as const)
    test(`joint contract authority ${contracts}/${staff} remains atomic`, async ({ page }) => {
      // 35 rounds are simulated here before the page opens; with the own league on the grid
      // engine (T218) that alone takes about 23 s on CI, so slow CI browsers need longer.
      test.slow();
      const { secondCareerFixture, exportedCareer } = await import('./career-fixtures');
      const { importResponsibilityCareer } = await import('./responsibility-fixtures');
      const { operate, advanceRound } = await import('../../packages/engine/src/index');
      const { configureResponsibilities } = await import('./events');
      const { w, player } = secondCareerFixture();
      for (let round = 0; round < 35; round++) advanceRound(w, undefined, false);
      player.qualities = { understanding: 5, teaching: 5, judgement: 5 };
      player.personality.professionalism = 5;
      Object.assign(w.people![player.id], {
        qualities: { ...player.qualities },
        professionalism: 5,
        intention: { at: { year: w.year, day: w.calendar!.day }, draw: 0.85, willing: false },
      });
      w.income = w.cash;
      w.settings!.responsibilities.contracts = contracts;
      w.settings!.responsibilities.staff = staff;
      operate(w, { type: 'encourage-coaching', player: player.id });
      operate(w, { type: 'propose-playing-coach', player: player.id, years: 2, term: 5 });
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
  // Nearly three seasons are simulated here first; with the own league on the grid engine (T218)
  // they take about 30 s before the page opens.
  test.setTimeout(180000);
  const { combinedCareerFixture, exportedCareer } = await import('./career-fixtures');
  const { importResponsibilityCareer } = await import('./responsibility-fixtures');
  const { simulateSeason, advanceRound } = await import('../../packages/engine/src/index');
  const { finishSeason } = await import('./season-progression');
  const { w, player, proposal } = await combinedCareerFixture();
  // Synthetic announced candidate; the following seasons and retirement use real lifecycle code.
  simulateSeason(w);
  simulateSeason(w);
  for (let round = 0; round < 45; round++) advanceRound(w, undefined, false);
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
  const card = page.getByTestId('event-card').filter({ hasText: '선수·코치 계약 종료 검토' });
  await expect(card).toContainText('코치 계약도 함께 종료');
  await expect(card).toContainText('기존 계약 종료 비용');
  await card.getByRole('button', { name: '수락하고 매각', exact: true }).click();
  const after = await exportedCareer(page);
  expect(BigInt(after.cash)).toBe(BigInt(w.cash) + BigInt(bid.fee) - BigInt(owed));
  expect(after.people![player.id].club).toBe(club);
  expect(after.staff!.some((s) => s.person === player.id)).toBe(false);
  expect(after.people![player.id].employment.filter((j) => !j.to).map((j) => j.role)).toEqual([
    'player',
  ]);
  await page.reload();
  expect((await exportedCareer(page)).cash).toBe(after.cash);
});
