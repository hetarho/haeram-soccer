import { openPersonnel } from './personnel-navigation';
import { advanceOneRound } from './season-progression';
import { expect, test, type Page } from '@playwright/test';
import {
  activePlayers,
  advanceDays,
  createWorld,
  currentDay,
  operate,
  ROUND_INTERVAL_DAYS,
  seasonDayOf,
  talksRound,
  UNHAPPY_CONFIG,
} from '../../packages/engine/src/index';
import { encode } from '../../apps/web/src/adapters/persistence';
import { eventCard, reviewEvent } from './events';
import { continueSlot } from './slots';
import { savedWorld } from './club-identity-helpers';

/**
 * A club on 1 January 1951 whose owner answers contract talks: one player in his contract's final
 * season has just asked to renew, and the manager would fail to talk him round (→CLUB-27).
 */
async function talking() {
  const w = createWorld({
    country: 'ENG',
    name: 'Contract Talks',
    color: '#2a5d8f',
    seed: 'contract-talks-journey',
    level: 'easy' as const,
  });
  // Isolate contract decisions; ordinary unhappiness and transfer-request reports do not stop time.
  operate(w, {
    type: 'settings',
    settings: {
      ...w.settings!,
      mode: 'manual',
      responsibilities: {
        ...w.settings!.responsibilities,
        contracts: 'direct',
        sales: 'delegated',
        recruitment: 'delegated',
      },
      observations: { matchEve: false, windowOpen: false },
    },
  });
  const newYear = seasonDayOf(w.year, 1, 1);
  advanceDays(w, newYear - 1 - currentDay(w), undefined, false);
  // The journey finds his roster card by name, so it must be the only one with that name.
  let player = activePlayers(w).find(
    (p) =>
      !p.talk &&
      !p.unhappy &&
      !p.loanUntil &&
      p.retiring === undefined &&
      activePlayers(w).filter((q) => q.name === p.name).length === 1 &&
      !talksRound(w, p, { kind: 'renew', demand: '0', floor: '0', year: w.year, day: newYear }),
  )!;
  // This marked synthetic fixture isolates one final-season contract from other January talks.
  for (const other of activePlayers(w))
    if (other.id !== player.id && !other.loanUntil) other.until = w.year + 4;
  player.until = w.year + 1;
  const playerId = player.id;
  advanceDays(w, 1, undefined, false);
  // Atomic delegated decisions can replace the world objects while the day settles.
  player = w.players.find((candidate) => candidate.id === playerId)!;
  expect(player.talk).toMatchObject({ kind: 'renew', day: newYear });
  expect(talksRound(w, player, player.talk!)).toBe(false);
  // Routine notifications are marked read; the one canonical contract decision remains pending.
  for (const item of w.inbox ?? []) if (item.kind !== 'contract-talk') item.read = true;
  return {
    raw: await encode(w, 1, 0),
    name: player.name,
    dueDay: currentDay(w) + UNHAPPY_CONFIG.requestDays,
  };
}
async function seed(page: Page, raw: string) {
  await page.addInitScript((raw) => {
    const envelope = JSON.parse(raw);
    localStorage.setItem('haeram-soccor:slot:a', raw);
    localStorage.setItem(
      'haeram-soccor:manifest',
      JSON.stringify({
        slot: 0,
        worldId: envelope.worldId,
        generation: envelope.generation,
        parentGeneration: envelope.parentGeneration,
      }),
    );
  }, raw);
}

test('declines a contract talk: the badge, then the transfer request', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One browser covers the journey.');
  // Six weeks of real match events are played in the browser.
  test.slow();
  const { raw, name, dueDay } = await talking();
  await seed(page, raw);
  await page.goto('/');
  await continueSlot(page);
  const card = eventCard(page);
  await expect(card).toContainText(`${name} 선수 계약에 답변해 주세요`);
  await reviewEvent(page, card);
  await expect(page).toHaveURL(/\/direction\?view=players&request=/);

  // The sheet states the demand, the floor, the term, the cost, the runway and the risk.
  const sheet = page.getByRole('dialog', { name: '계약 협상' });
  await expect(sheet.getByRole('heading', { name: `${name} 재계약 협상` })).toBeVisible();
  await expect(sheet).toContainText('요구');
  await expect(sheet).toContainText('하한');
  // His agent's rating and the clauses the new contract would carry (→CLUB-29, CLUB-30).
  await expect(sheet).toContainText(/에이전트 [1-5]등급/);
  await expect(sheet).toContainText('새 계약 조항');
  // Signed in the winter window: the rest of this season and 0–4 more (→CLUB-26).
  const terms = sheet.getByRole('radiogroup', { name: '계약 기간' }).getByRole('radio');
  await expect(terms).toHaveText(['½시즌', '1½시즌', '2½시즌', '3½시즌', '4½시즌']);
  await expect(sheet).toContainText('겨울 계약');
  await expect(sheet).toContainText('연 비용');
  await expect(sheet).toContainText('자금 여력');
  await expect(sheet).toContainText(/거절하면 감독이 설득해요: 성공 \d+%/);
  await sheet.getByRole('button', { name: '거절', exact: true }).click();
  await expect(sheet).toHaveCount(0);

  // The manager could not talk him round: the roster card on 사람's 선수 wears the badge with its
  // reason.
  await expect(page).toHaveURL(/\/journal$/);
  await openPersonnel(page, 'players');
  const roster = page.locator('article').filter({ hasText: name });
  // 선수 ends with who answers talks: the owner, at level 1 (→WEB-43).
  await expect(
    page.getByRole('region', { name: '계약 협상 위임' }).getByTestId('decision-owner-contracts'),
  ).toContainText('직접');
  await expect(roster.getByText('언해피 · 재계약 거절')).toBeVisible();
  await expect(roster).toContainText('시장');

  await page.getByRole('button', { name: '클럽하우스', exact: true }).click();
  await expect(card).toHaveCount(0);

  // Six weeks later he hands in a transfer request.
  let day = currentDay(await savedWorld(page));
  const maxMatches = Math.ceil(UNHAPPY_CONFIG.requestDays / ROUND_INTERVAL_DAYS) + 1;
  for (let match = 0; day < dueDay && match < maxMatches; match++) {
    await advanceOneRound(page);
    const nextDay = currentDay(await savedWorld(page));
    expect(nextDay).toBeGreaterThan(day);
    day = nextDay;
  }
  expect(day).toBeGreaterThanOrEqual(dueDay);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.getByTestId('communications-button').click();
  const news = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await expect(news).toContainText(`${name}, 이적 요청서 제출`);
  await news.getByRole('button', { name: '닫기', exact: true }).click();

  // 사람 opens on 선수, the roster.
  await openPersonnel(page, 'players');
  await expect(page).toHaveURL(/\/first-team\?view=players$/);
  await expect(roster.getByText('이적 요청', { exact: true })).toBeVisible();
  await expect(
    roster.getByRole('button', { name: `${name} 이적 상태 · 이적 명단 · 바꾸기` }),
  ).toBeVisible();
});

test('the talk rule shows under 선수 and applies', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'One browser covers the journey.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill('talk-rule-journey');
  await page.getByRole('button', { name: '쉬움' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await openPersonnel(page, 'players');
  // The owner holds contracts; the delegated criteria remain visible for a later handover.
  const talks = page.getByRole('region', { name: '계약 협상 위임' });
  await expect(talks.getByRole('checkbox')).toHaveCount(0);
  await expect(talks.getByTestId('decision-owner-contracts')).toContainText('직접');
  await expect(talks.getByRole('button', { name: /^재정 기조 · 표준/ })).toBeVisible();
  await expect(talks).toContainText('시장가의 110%까지');
  await expect(talks).toContainText('32세부터 1시즌');
  await expect(talks).toContainText('13라운드 운영비');
  await expect(talks).toContainText('언해피');
  // The row is chosen on the 방향 board, its area unfolded by the line.
  await talks.getByRole('button', { name: /^재계약 기조 · 표준/ }).click();
  const squad = page
    .getByRole('dialog', { name: '선수단·계약 업무 기준', exact: true })
    .getByRole('region', { name: '선수단·계약', exact: true });
  await squad.getByRole('radio', { name: '재계약 기조 짠물', exact: true }).click();
  const draft = page.getByTestId('strategy-draft');
  await expect(draft).toContainText('재계약 기조 표준 → 짠물');
  await draft.getByRole('button', { name: '적용', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await openPersonnel(page, 'players');
  await expect(
    page
      .getByRole('region', { name: '계약 협상 위임' })
      .getByRole('button', { name: /^재계약 기조 · 짠물/ }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: '계약 협상 위임' })).toContainText('시장가까지만');
});
