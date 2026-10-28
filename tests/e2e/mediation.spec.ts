import { openPersonnel } from './personnel-navigation';
import { marketInfo, marketCandidate, closeMarketPanel } from './market';
import { dismissMatchReport, openOffice } from './events';
import { test, expect, type Page } from '@playwright/test';
import {
  createWorld,
  transferOffers,
  operate,
  managerCandidates,
  prepareSeason,
  transferWindowDays,
} from '../../packages/engine/src/index';
import { detectMediations, resolveMediation } from '../../packages/engine/src/mediation';
import { judgePromises } from '../../packages/engine/src/promises';
import { worldMarketPage } from '../../packages/engine/src/world-market';
import { DEFAULT_MARKET_QUERY } from '../../apps/web/src/ui/worldMarket';
import { lineOf } from '../../packages/engine/src/player';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { horizontalOverflow } from './layout';
function fixture() {
  const w = createWorld({
    country: 'ENG',
    name: 'Synthetic Mediation',
    color: '#224466',
    seed: 'synthetic-mediation',
    level: 'normal',
  });
  w.settings!.responsibilities.recruitment = 'direct';
  w.settings!.mode = 'manual';
  w.settings!.observations.matchEve = true;
  w.cash = '0';
  ask(w, 'MF');
  return w;
}
function ask(w: ReturnType<typeof createWorld>, line: 'MF' | 'GK') {
  const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === line)!;
  w.shortlist = {
    year: w.year,
    day: w.calendar!.day,
    entries: [{ playerId: offer.player.id, line }],
    requests: [{ kind: 'short', line, pick: offer.player.id }],
  };
  detectMediations(w);
  return w.mediations!.at(-1)!;
}
async function market(page: Page, w: ReturnType<typeof createWorld>) {
  await importResponsibilityCareer(page, w);
  await dismissMatchReport(page);
  await openPersonnel(page, 'players');
  await openPersonnel(page, 'market');
}
test('direct-financial-conflict-review', async ({ page }) => {
  const w = fixture(),
    record = w.mediations![0];
  await market(page, w);
  await marketInfo(page);
  const commitments = page.getByRole('region', { name: '영입 중재와 보강 약속' });
  await commitments.getByRole('button', { name: '영입 중재 검토', exact: true }).click();
  const review = page.getByRole('dialog', { name: '영입 중재 검토' });
  await expect(review).toContainText(record.manager.name);
  await expect(review).toContainText(record.director.name);
  await expect(review).toContainText(record.directorReason);
  await expect(review.getByLabel('이번 중재 결과 미리보기')).toContainText('보강 약속');
  await expect(review).toContainText('마감');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(review.getByLabel('중재 대상')).toBeVisible();
  await expect(review.getByRole('region', { name: '감독과 단장 의견' })).toBeVisible();
  await expect(
    review.locator('footer').getByRole('button', { name: '이번 중재 결정 확정', exact: true }),
  ).toBeInViewport();
  const choices = await review.getByRole('radio').evaluateAll((inputs) =>
    inputs.map((input) => {
      const rect = input.getBoundingClientRect();
      return { y: rect.y, width: rect.width, height: rect.height };
    }),
  );
  expect(choices).toHaveLength(3);
  for (const choice of choices) {
    expect(choice.y).toBeCloseTo(choices[0].y, 0);
    expect(choice.width).toBeGreaterThanOrEqual(44);
    expect(choice.height).toBeGreaterThanOrEqual(44);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await review.getByRole('button', { name: '이번 중재 결정 확정', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(commitments).toContainText('이행 대기');
});
test('case-support-is-not-standing-policy', async ({ page }) => {
  const w = fixture();
  await market(page, w);
  await marketInfo(page);
  await page
    .getByRole('region', { name: '영입 중재와 보강 약속' })
    .getByRole('button', { name: '영입 중재 검토', exact: true })
    .click();
  const review = page.getByRole('dialog', { name: '영입 중재 검토' });
  await review.getByRole('radio', { name: '단장 우선', exact: true }).check();
  await expect(review.getByLabel('이번 중재 결과 미리보기')).toContainText('미뤘어요');
  await review.getByRole('button', { name: '이번 중재 결정 확정', exact: true }).click();
  await expect(review).toHaveCount(0);
  await page.getByRole('button', { name: '전체 영입 결정 기록', exact: true }).click();
  const history = page.getByRole('dialog', { name: '영입 결정 기록' });
  await expect(history).toContainText('당시 지원 방침 균형 · 단장 우선 결정');
  await expect(history).not.toContainText('이행 대기');
});
test('support changes retain the preview and confirm only the latest conditions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options?) {
      const send = () => Reflect.apply(post, this, options ? [message, options] : [message]);
      if (message.body?.type === 'mediation-preview')
        setTimeout(send, message.body.support === 'director' ? 900 : 150);
      else send();
    };
  });
  await market(page, fixture());
  await marketInfo(page);
  await page
    .getByRole('region', { name: '영입 중재와 보강 약속' })
    .getByRole('button', { name: '영입 중재 검토', exact: true })
    .click();
  const review = page.getByRole('dialog', { name: '영입 중재 검토' });
  const preview = review.getByLabel('이번 중재 결과 미리보기');
  const confirm = review.getByRole('button', { name: '이번 중재 결정 확정', exact: true });
  await expect(preview).toHaveAttribute('aria-busy', 'false');
  await expect(preview).toContainText('보강 약속');
  await expect(confirm).toHaveCSS('opacity', '1');
  await expect(confirm).toHaveCSS('filter', 'none');
  const original = await preview.elementHandle();
  const height = (await preview.boundingBox())!.height;
  await review.getByRole('radio', { name: '단장 우선', exact: true }).check();
  await expect(preview).toHaveAttribute('aria-busy', 'true');
  await expect(preview).toContainText('보강 약속');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveCSS('opacity', '1');
  await expect(confirm).toHaveCSS('filter', 'none');
  expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(height);
  await review.getByRole('radio', { name: '감독 우선', exact: true }).check();
  await expect(preview).toHaveAttribute('aria-busy', 'false');
  await expect(confirm).toBeEnabled();
  await page.waitForTimeout(950);
  await expect(preview).toContainText('보강 약속');
  await expect(preview).not.toContainText('미뤘어요');
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await review.getByRole('radio', { name: '단장 우선', exact: true }).check();
  await expect(confirm).toBeDisabled();
  await expect(preview).toContainText('미뤘어요');
  await expect(confirm).toBeEnabled();
  expect((await preview.boundingBox())!.height).toBeGreaterThanOrEqual(height);
  await review.getByRole('radio', { name: '균형', exact: true }).check();
  await expect(confirm).toBeDisabled();
  await expect(preview).toHaveAttribute('aria-busy', 'false');
  await expect(confirm).toBeEnabled();
});
test('retained-promise-status', async ({ page }) => {
  const w = fixture();
  resolveMediation(w, w.mediations![0].id, 'manager', 'delegated');
  const gk = ask(w, 'GK');
  resolveMediation(w, gk.id, 'manager', 'delegated');
  const free = transferOffers(w).findIndex((o) => o.freeAgent);
  operate(w, { type: 'recruit', candidate: free });
  w.calendar = { day: transferWindowDays(w.year).winterClose + 1 };
  w.round = Math.floor(w.calendar.day / 7);
  delete w.scorerSeason;
  judgePromises(w);
  w.year++;
  prepareSeason(w);
  w.manager.until = w.year + 3;
  w.cash = '0';
  const pending = ask(w, 'MF');
  resolveMediation(w, pending.id, 'manager', 'delegated');
  w.cash = '999999999999';
  operate(w, { type: 'hire', id: managerCandidates(w)[0].id });
  w.cash = '0';
  const last = ask(w, 'MF');
  resolveMediation(w, last.id, 'manager', 'delegated');
  w.inbox = [];
  w.events = [];
  await market(page, w);
  await marketInfo(page);
  await page.getByRole('button', { name: '전체 영입 결정 기록', exact: true }).click();
  const history = page.getByRole('dialog', { name: '영입 결정 기록' });
  for (const text of ['이행 대기', '이행 완료', '미이행', '취소'])
    await expect(history).toContainText(text);
  await expect(history).toContainText('마감');
  await expect(history).not.toContainText('신뢰 +');
});

for (const mode of ['manual', 'automatic'] as const)
  test(`direct mediation stops ${mode} and survives reading notifications`, async ({ page }) => {
    const { exportedCareer } = await import('./career-fixtures');
    const w = fixture();
    ask(w, 'GK');
    w.settings!.mode = mode;
    await importResponsibilityCareer(page, w);
    const before = await exportedCareer(page);
    if (mode === 'manual')
      await expect(page.getByRole('button', { name: '다음 이벤트', exact: true })).toBeDisabled();
    else await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
    await page.getByTestId('communications-button').click();
    const sheet = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
    await sheet.getByRole('button', { name: '모두 읽음', exact: true }).click();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    const after = await exportedCareer(page);
    expect(after.calendar).toEqual(before.calendar);
    expect(after.mediations![0].status).toBe('pending');
    expect(after.promises ?? []).toHaveLength(0);
    await expect(
      page.getByTestId('event-card').getByRole('button', { name: '검토하기', exact: true }),
    ).toHaveCount(2);
  });

test('mediation-handover-on-apply discloses work and never replays its recorded policy', async ({
  page,
}) => {
  const { exportedCareer } = await import('./career-fixtures');
  const { configureResponsibilities } = await import('./events');
  const w = fixture();
  await importResponsibilityCareer(page, w);
  const office = await openOffice(page);
  await office
    .getByRole('group', { name: '선수 영입', exact: true })
    .getByRole('button', { name: '자동', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: '자동으로 처리하겠습니다.', exact: true });
  await expect(dialog.getByRole('region', { name: '대기 업무 이관 미리보기' })).toContainText(
    '선수 영입 1건',
  );
  await dialog.getByRole('button', { name: '자동으로 맡기기', exact: true }).click();
  await page
    .getByTestId('action-outcome')
    .getByRole('button', { name: /^(확인|알림 닫기)$/ })
    .click();
  const after = await exportedCareer(page);
  expect(after.mediations![0].status).toBe('resolved');
  expect(after.mediations![0].resolution!.support).toBe('balanced');
  expect(after.mediations![0].support).toBe('balanced');
  const recorded = structuredClone(after.mediations),
    promises = structuredClone(after.promises),
    cash = after.cash;
  await configureResponsibilities(page, { responsibilities: { recruitment: 'direct' } });
  await page.reload();
  const again = await exportedCareer(page);
  expect(again.mediations).toEqual(recorded);
  expect(again.promises).toEqual(promises);
  expect(again.cash).toBe(cash);
});

for (const arrival of ['none', 'loan', 'free'] as const)
  test(`promise-reload-and-deadline with ${arrival} retains the original commitment`, async ({
    page,
    browser,
  }) => {
    // Half a season is simulated here before the page opens; with the own league on the grid
    // engine (T218) that alone takes about 22 s on CI, so slow CI browsers need longer.
    test.slow();
    const { exportedCareer } = await import('./career-fixtures');
    const { advanceToNextEvent } = await import('../../packages/engine/src/next-event');
    const w = fixture();
    if (arrival === 'free') {
      w.mediations = [];
      ask(w, 'GK');
    }
    resolveMediation(w, w.mediations![0].id, 'manager', 'delegated');
    const promise = w.promises![0];
    w.cash = '999999999999';
    // This journey advances to a promise deadline; pre-match reporting is covered separately.
    w.settings!.observations.matchEve = false;
    const { advanceDays } = await import('../../packages/engine/src/index');
    w.settings!.responsibilities.contracts = 'delegated';
    w.settings!.responsibilities.sales = 'delegated';
    // A paid loan must be offered before the deadline and answered through the real bid flow.
    // Prepare a counter awaiting the owner's final signature on deadline day; its eventual
    // acceptance, cost and promise fulfilment still happen through the public browser control.
    advanceDays(w, promise.deadline.day - (arrival === 'loan' ? 4 : 0), undefined, false);
    let loan: { id: string; player: string; name: string; fee: string } | undefined;
    if (arrival === 'loan') {
      for (const offer of worldMarketPage(w, {
        world: w.id,
        line: promise.target.line,
        sort: 'fee',
        direction: 'asc',
      }).items.filter(
        (one) =>
          one.available &&
          !one.freeAgent &&
          BigInt(one.loanFee) >= 2n &&
          lineOf(one.player.position) === promise.target.line &&
          one.player.id !== promise.target.pick,
      )) {
        const copy = structuredClone(w);
        operate(copy, {
          type: 'bid',
          target: offer.target,
          loan: true,
          fee: ((BigInt(offer.loanFee) * 80n) / 100n).toString(),
        });
        advanceDays(copy, 4, undefined, false);
        const bid = copy.bids?.find(
          (bid) => bid.playerId === offer.player.id && bid.loan && bid.status === 'countered',
        );
        if (!bid) continue;
        Object.assign(w, copy);
        loan = { id: bid.id, player: bid.playerId, name: offer.player.name, fee: bid.counterFee! };
        break;
      }
      expect(loan, 'seeded paid loan counter on the unchanged promise deadline').toBeDefined();
    }
    // Other real winter-window conflicts are explicitly postponed; the original promise stays.
    for (const record of w.mediations!.filter((m) => m.status === 'pending'))
      operate(w, { type: 'resolve-mediation', id: record.id, support: 'director' });
    await market(page, w);
    let free: ReturnType<typeof transferOffers>[number] | undefined;
    if (loan) {
      await page.getByRole('button', { name: /^이적 협상 ·/ }).click();
      const dialog = page.getByRole('dialog', { name: '이적 협상', exact: true });
      const counter = dialog.locator('[data-status="countered"]').filter({ hasText: loan.name });
      await counter.getByRole('button', { name: '수락', exact: true }).click();
      await expect(
        dialog.locator('[data-status="completed"]').filter({ hasText: loan.name }),
      ).toBeVisible();
      await closeMarketPanel(page, '이적 협상');
    } else if (arrival === 'free') {
      free = transferOffers(w).find(
        (o) =>
          o.available &&
          lineOf(o.player.position) === promise.target.line &&
          o.player.id !== promise.target.pick &&
          o.freeAgent,
      )!;
      expect(free).toBeDefined();
      const matches = worldMarketPage(w, {
        world: w.id,
        ...DEFAULT_MARKET_QUERY,
        name: free.player.name,
      });
      // The intended free agent is behind a full page of other players with this same name.
      expect(matches.total).toBeGreaterThan(matches.pageSize);
      expect(matches.items.map((offer) => offer.player.id)).not.toContain(free.player.id);
      await expect(
        marketCandidate(page, `${free.player.id}:absent`, free.player.name),
      ).rejects.toThrow(`Market player ${free.player.id}:absent (${free.player.name}) absent:`);
      await expect(
        page
          .getByRole('navigation', { name: '영입 목록 페이지', exact: true })
          .getByRole('button', { name: '다음 페이지', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('dialog', { name: '영입 후보 상세', exact: true })).toHaveCount(
        0,
      );
      const card = await marketCandidate(page, free.player.id, free.player.name);
      await card
        .getByRole('button', {
          name: '자유계약 영입',
          exact: true,
        })
        .click();
      await closeMarketPanel(page, '영입 후보 상세');
    }
    const before = await exportedCareer(page);
    if (free) {
      expect(before.players.find((player) => player.id === free.player.id)).toMatchObject({
        status: 'active',
        wage: free.player.wage,
      });
      expect(before.cash).toBe(w.cash);
    }
    if (loan) {
      expect(before.bids!.find((bid) => bid.id === loan.id)).toMatchObject({
        status: 'completed',
        playerId: loan.player,
        loan: true,
      });
      expect(before.players.find((player) => player.id === loan.player)?.loanUntil).toBe(
        w.year + 1,
      );
      expect(BigInt(w.cash) - BigInt(before.cash)).toBe(BigInt(loan.fee));
    }
    expect(before.promises![0].deadline).toEqual(promise.deadline);
    expect(before.promises![0].status).toBe('pending');
    await page.reload();
    expect((await exportedCareer(page)).promises).toEqual(before.promises);
    // Portable import uses a new browser profile and the exact same retained commitment.
    const context = await browser.newContext();
    try {
      const imported = await context.newPage();
      await importResponsibilityCareer(imported, before);
      const restored = await exportedCareer(imported);
      expect(restored.promises).toEqual(before.promises);
      const expected = structuredClone(restored);
      advanceToNextEvent(expected);
      await imported.getByRole('button', { name: '다음 이벤트', exact: true }).click();
      await expect(imported.getByTestId('game-date')).not.toHaveText(
        await page.getByTestId('game-date').innerText(),
      );
      const judged = await exportedCareer(imported);
      expect(judged.promises![0].status).toBe(arrival === 'none' ? 'unfulfilled' : 'fulfilled');
      expect(judged.promises![0]).toEqual(expected.promises![0]);
      expect(judged.manager.trust).toBe(expected.manager.trust);
      expect(judged.promises![0].deadline).toEqual(promise.deadline);
      await imported.reload();
      const reloaded = await exportedCareer(imported);
      expect(reloaded.promises).toEqual(judged.promises);
      expect(reloaded.manager.trust).toBe(judged.manager.trust);
    } finally {
      await context.close();
    }
  });

test('promise-personnel-changes preserves director-independent promises and cancels on manager replacement', async ({
  page,
}) => {
  const { exportedCareer } = await import('./career-fixtures');
  const w = fixture();
  resolveMediation(w, w.mediations![0].id, 'manager', 'owner');
  w.cash = '999999999999';
  w.settings!.responsibilities.staff = 'direct';
  const director = w.staff!.find((s) => s.role === 'director')!;
  await importResponsibilityCareer(page, w);
  await openPersonnel(page, 'players');
  await openPersonnel(page, 'coaches');
  const post = page.locator('#staff-post-director');
  await expect(post).toContainText(director.name);
  await post.getByRole('button', { name: '교체', exact: true }).click();
  await page
    .getByRole('dialog', { name: '단장 선임', exact: true })
    .getByRole('button', { name: /^계약 해지/ })
    .click();
  expect((await exportedCareer(page)).promises![0].status).toBe('pending');
  await openPersonnel(page, 'manager');
  await page.getByRole('button', { name: '교체', exact: true }).click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('button', { name: /^감독 선임 ·/ }) })
    .first();
  await card.getByRole('button', { name: /^감독 선임 ·/ }).click();
  await page
    .getByRole('dialog', { name: '감독 선임 확인' })
    .getByRole('button', { name: '선임 확정', exact: true })
    .click();
  const after = await exportedCareer(page);
  expect(after.promises![0].status).toBe('cancelled');
  expect(after.promises![0].deadline).toEqual(w.promises![0].deadline);
  await page.reload();
  expect((await exportedCareer(page)).promises).toEqual(after.promises);
});
