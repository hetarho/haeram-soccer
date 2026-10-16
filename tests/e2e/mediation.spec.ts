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
  await page.getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await page
    .getByRole('tablist', { name: '선수단·스태프 보기' })
    .getByRole('tab', { name: '이적시장', exact: true })
    .click();
}
test('direct-financial-conflict-review', async ({ page }) => {
  const w = fixture(),
    record = w.mediations![0];
  await market(page, w);
  const commitments = page.getByRole('region', { name: '영입 중재와 보강 약속' });
  await commitments.getByRole('button', { name: '영입 중재 검토', exact: true }).click();
  const review = page.getByRole('dialog', { name: '영입 중재 검토' });
  await expect(review).toContainText(record.manager.name);
  await expect(review).toContainText(record.director.name);
  await expect(review).toContainText(record.directorReason);
  await expect(review.getByLabel('이번 중재 결과 미리보기')).toContainText('보강 약속');
  await expect(review).toContainText('마감');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await review.getByRole('button', { name: '이번 중재 결정 확정', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(commitments).toContainText('이행 대기');
});
test('case-support-is-not-standing-policy', async ({ page }) => {
  const w = fixture();
  await market(page, w);
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
  await page.getByRole('button', { name: '전체 영입 결정 기록', exact: true }).click();
  const history = page.getByRole('dialog', { name: '영입 결정 기록' });
  for (const text of ['이행 대기', '이행 완료', '미이행', '취소'])
    await expect(history).toContainText(text);
  await expect(history).toContainText('마감');
  await expect(history).not.toContainText('신뢰 +');
});
