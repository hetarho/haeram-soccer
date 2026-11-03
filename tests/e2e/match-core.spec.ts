import { openLeague, returnToMatch } from './competition-navigation';
import { advanceToNextMatch } from '../../packages/engine/src/testing';
import {
  closeMatchDetails,
  matchDetails,
  openMatchDetails,
  openPlayerSheet,
  presentedMinute,
  watchNext,
} from './watch';
import { configureResponsibilities, reportKit } from './events';
import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  clubOf,
  lineupSummary,
  nextOwnFixture,
  operate,
  startingSquad,
  tacticLabel,
} from '../../packages/engine/src/index';
import { injectionSteps } from '../../apps/web/src/ui/ownerFigures';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { generateHistory } from '../../packages/engine/src/history';
import { takeOver } from '../../packages/engine/src/takeover';
import type { World } from '../../packages/contracts/src/types';
import { expectViewFits, horizontalOverflow, settle } from './layout';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import { WATCH_DEFAULT_SPEED, WATCH_MINUTE_MS } from '../../apps/web/src/ui/presentationClock';
import { committedRaw, openRecordedMatch } from './club-identity-helpers';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { DEFAULT_START, fundClub, startCareer } from './start';

/** The career the engine makes from the browser's start: the same seed, club and choices. */
function takenOver(seed: string, clubId: string): World {
  return takeOver(generateHistory(seed, DEFAULT_START.decade), clubId, {
    tier: DEFAULT_START.tier,
    traits: [],
  });
}

async function savedRaw(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return (await committedRaw(page))!;
}

async function expectCompactMatch(page: Page, viewport: { width: number; height: number }) {
  await settle(page);
  await expect
    .poll(() =>
      page.getByLabel('22명의 선수와 공으로 표현하는 경기').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const bounds = canvas.getBoundingClientRect();
        return Math.abs(canvas.width / canvas.height - bounds.width / bounds.height);
      }),
    )
    .toBeLessThan(0.015);
  const geometry = await page.evaluate(() => {
    const theatre = document.querySelector('[data-testid="match-theatre"]')!;
    const menu = document.querySelector('nav[aria-label="모바일 게임 메뉴"]')!;
    const required = [
      theatre.querySelector('[data-testid="match-score"]')!,
      theatre.querySelector('canvas')!,
      theatre.querySelector('[data-testid="match-latest-event"]')!,
      theatre.querySelector('[data-testid="match-feedback"]')!,
    ];
    // The theatre's own controls: the standing after the match (→WEB-50) scrolls on below it.
    const stage = theatre.querySelector('[data-ui="match-theatre"]')!;
    const controls = [...stage.querySelectorAll('button,select')].filter(
      (element) => element.getClientRects().length,
    );
    // The theatre has no tab bar; the bottom navigation is how the player leaves it.
    const navigation = [...menu.querySelectorAll('button')];
    const measure = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') || element.textContent || element.tagName,
        control: ['BUTTON', 'SELECT'].includes(element.tagName),
        visible:
          !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      menuTop: menu.getBoundingClientRect().top,
      targets: [...required, ...controls].map(measure),
      navigation: navigation.map(measure),
    };
  });
  // Once the match ends its standing follows below the theatre (→WEB-50) and the view may scroll
  // to it; the theatre itself still fits the first screen.
  if (await page.getByRole('heading', { name: '경기 뒤의 순위표' }).count())
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  else await expectViewFits(page);
  for (const bounds of geometry.targets) {
    expect(bounds.visible, bounds.label).toBe(true);
    expect(bounds.x, bounds.label).toBeGreaterThanOrEqual(0);
    expect(bounds.y, bounds.label).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, bounds.label).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height, bounds.label).toBeLessThanOrEqual(geometry.menuTop);
    if (bounds.control) {
      expect(bounds.width, bounds.label).toBeGreaterThanOrEqual(44);
      expect(bounds.height, bounds.label).toBeGreaterThanOrEqual(44);
    }
  }
  for (const bounds of geometry.navigation) {
    expect(bounds.width, bounds.label).toBeGreaterThanOrEqual(44);
    expect(bounds.height, bounds.label).toBeGreaterThanOrEqual(44);
  }
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps the full match loop in ${viewport.width}x${viewport.height} and preserves actual seeded facts`, async ({
    page,
  }) => {
    // A whole match watched, replayed and settled: 25–28 s alone since the theatre grew (T225).
    test.slow();
    const seed = `match-core-${viewport.width}`;
    await page.setViewportSize(viewport);
    await page.goto('/');
    await startCareer(page, { seed });
    // Keep the theatre geometry independent of the money band (→WEB-17, WEB-56), using the
    // first 자금 투입 step in addition to the club's opening cash.
    await fundClub(page);
    // The reference takes the same club over from the same seed and choices (→WORLD-13), and the
    // owner puts the same step in.
    const clubId = (await decode(await savedRaw(page))).world.playerClub;
    const reference = takenOver(seed, clubId);
    operate(reference, { type: 'owner-inject', amount: injectionSteps(reference)[0]! });
    reference.settings!.responsibilities.sales = 'delegated';
    reference.settings!.responsibilities.recruitment = 'delegated';
    const first = advanceToNextMatch(reference)!;
    const incidents = first.record.incidents ?? [];
    const sentOff = [0, 1].map(
      (side) =>
        incidents.filter((i) => i.side === side && (i.kind === 'red' || i.kind === 'secondYellow'))
          .length,
    );
    await configureResponsibilities(page, {
      responsibilities: { sales: 'delegated', recruitment: 'delegated' },
    });
    const nav = page.getByRole('navigation', { name: '모바일 게임 메뉴' });
    // The match has no tab and its address alone leads home: only a watch action opens it.
    await expect(nav.getByRole('button', { name: '경기', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.goto('/matches');
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page).toHaveURL(/\/journal$/);
    await watchNext(page, { manual: true });
    await expect(page.getByTestId('match-theatre')).toBeVisible();
    await expect(page.getByRole('tablist', { name: '리그 보기' })).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
        return new Set(ids).size === ids.length;
      }),
    ).toBe(true);
    await expect(
      page.getByRole('radio', { name: `${WATCH_DEFAULT_SPEED}×`, exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radiogroup', { name: '관전 속도' }).getByRole('radio')).toHaveText(
      ['1×', '2×', '4×', '8×', '16×'],
    );
    await page.evaluate(() => {
      (window as typeof window & { matchCanvas?: Element | null }).matchCanvas =
        document.querySelector('canvas');
    });
    await expectCompactMatch(page, viewport);
    await expect(page.getByTestId('match-result-summary')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: '경기 시간', exact: true })).toBeHidden();
    // While the match plays the primary action reveals the result instead of starting another.
    await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('결과 보기');
    await expect(page.getByRole('tablist', { name: '그래프 종류' }).getByRole('tab')).toHaveText([
      '점유율',
      'xG',
      '슈팅',
    ]);
    // Speed changes keep the presented minute, and 16x runs every minute, restarts included, in
    // 750 ms (→WEB-32): four of them cover several minutes without slowing at a dead ball.
    const minuteNow = async () => Number((await presentedMinute(page)).match(/\d+/)?.[0] ?? 0);
    const before = await minuteNow();
    await page.getByRole('radio', { name: '16×', exact: true }).click();
    expect(await minuteNow()).toBeGreaterThanOrEqual(before);
    // A goal's hold (→WEB-94) is real time outside running play, so it may sit inside the wait.
    await page.waitForTimeout((4 * WATCH_MINUTE_MS) / 16 + GOAL_FEEDBACK_CONFIG.holdMs);
    expect((await minuteNow()) - before).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    // The scoreboard carries one red mark per player sent off; the commentary ends on the final
    // whistle, its minute label beside it.
    await expect(page.getByTestId('red-cards-home').locator('i')).toHaveCount(sentOff[0]);
    await expect(page.getByTestId('red-cards-away').locator('i')).toHaveCount(sentOff[1]);
    await expect(page.getByTestId('match-latest-event').locator('span')).toHaveText(
      /^90(\+\d+)?′$/,
    );
    await expect(page.getByTestId('match-latest-event').locator('p')).not.toBeEmpty();
    await expectCompactMatch(page, viewport);
    const side = first.record.home === reference.playerClub ? 0 : 1;
    const ownGoals = side === 0 ? first.record.score.home : first.record.score.away;
    const otherGoals = side === 0 ? first.record.score.away : first.record.score.home;
    const result = page.getByTestId('match-result-summary');
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    await expect(result).toContainText(
      `슛 ${first.record.metrics[side][4]}–${first.record.metrics[1 - side][4]}`,
    );
    await expect(result).toContainText(
      `유효 슛 ${first.record.metrics[side][5]}–${first.record.metrics[1 - side][5]}`,
    );
    await expect(page.getByTestId('match-readiness')).toContainText(
      `${tacticLabel[reference.tactic]} · 피로 ${lineupSummary(startingSquad(reference, clubOf(reference)), reference.tactic).fatigue}/100`,
    );
    await expect(page.getByTestId('match-next-action')).toHaveAccessibleName('홈으로');
    const settled = await savedRaw(page);
    expect((await decode(settled)).world.ownMatches[0]).toEqual(reference.ownMatches[0]);
    // Preparation was skipped: the record wears the automatic selection, captured at settlement.
    const prematch = takenOver(seed, clubId);
    expect(reference.ownMatches[0].appearance).toEqual(
      appearanceForFixture(prematch, nextOwnFixture(prematch)!),
    );
    // The standing after the match shows once it ends, without opening its details (→WEB-50).
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
    const actionBounds = await page.getByTestId('match-next-action').boundingBox();
    const menuBounds = await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .boundingBox();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(menuBounds!.y);
    const details = await openMatchDetails(page);
    await expect(details.getByRole('slider', { name: '경기 시간', exact: true })).toBeVisible();
    // The scrubber reads the presented frame's label against the last one.
    await expect(details.getByText(/^(90(\+\d+)?)′ \/ \1′$/)).toBeVisible();
    await expect(details.getByText('패스 성공', { exact: true })).toBeVisible();
    await closeMatchDetails(page);
    // A tapped player's decisions open over the still pitch; players sent off show as the
    // scoreboard's red marks above, since the sheet reads only players on the pitch.
    const sheet = await openPlayerSheet(page);
    await sheet.getByRole('button', { name: '창 닫기', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expectCompactMatch(page, viewport);
    await openLeague(page);
    const leagueTabs = page.getByRole('tablist', { name: '리그 보기' }).getByRole('tab');
    await expect(leagueTabs).toHaveText(['순위표', '일정·결과', '팀 기록', '선수 기록']);
    for (const tab of await leagueTabs.all()) {
      // The protocol rounds 44px at fractional positions below 44; read the DOM size itself.
      const bounds = await tab.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      expect(bounds.width, await tab.innerText()).toBeGreaterThanOrEqual(44);
      expect(Math.round(bounds.height * 100) / 100, await tab.innerText()).toBeGreaterThanOrEqual(
        44,
      );
    }
    const overviewTab = page.getByRole('tab', { name: '순위표', exact: true });
    await overviewTab.focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: '선수 기록', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(overviewTab).toBeFocused();
    await page.getByRole('tab', { name: '팀 기록', exact: true }).click();
    await page
      .getByRole('group', { name: '팀 기록 보기' })
      .getByRole('button', { name: '순위 추이', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '시즌 순위 추이' })).toBeVisible();
    // The league is a primary entry, so back leads straight to the retained theatre.
    await returnToMatch(page);
    await expectCompactMatch(page, viewport);
    const moments = await openMatchDetails(page);
    await moments.getByText('주요 장면 탐색', { exact: true }).click();
    // Red cards and substitutions join the goals, labelled with their minute (45+n, 90+n).
    await expect(moments.getByTestId('recorded-incident')).toHaveCount(
      incidents.filter((i) => i.kind === 'red' || i.kind === 'secondYellow' || i.kind === 'sub')
        .length,
    );
    for (const incident of incidents.filter((i) => i.kind === 'sub'))
      await expect(
        moments
          .getByTestId('recorded-incident')
          .filter({ hasText: `${incident.minute}${incident.added ? `+${incident.added}` : ''}′` })
          .filter({ hasText: '↔' }),
      ).not.toHaveCount(0);
    // The result held the match still, so the kick-off seek keeps its place once the dialog closes.
    await moments.getByRole('button', { name: '킥오프 · 1분', exact: true }).click();
    await closeMatchDetails(page);
    await expect(page.getByTestId('match-result-summary')).toHaveCount(0);
    await expectCompactMatch(page, viewport);
    expect(await savedRaw(page)).toBe(settled);
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { matchCanvas?: Element | null }).matchCanvas ===
          document.querySelector('canvas'),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    const prepare = page
      .getByTestId('match-theatre')
      .getByRole('button', { name: '상세 리포트', exact: true });
    await prepare.click();
    const preparation = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
    await expect(preparation).toBeVisible();
    // The settled match on screen offers no shirt choice; only the next fixture does (→WEB-88).
    const upcoming = nextOwnFixture(reference)!;
    expect(upcoming.id).not.toBe(first.record.id);
    await expect((await reportKit(preparation)).getByTestId('fixture-kit')).toHaveAttribute(
      'data-fixture-id',
      upcoming.id,
    );
    await preparation.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
    await expect(preparation).toHaveCount(0);
    await expect(prepare).toBeFocused();
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    expect(await savedRaw(page)).toBe(settled);
    advanceToNextMatch(reference);
    const matchDate = page.getByTestId('match-theatre').getByTestId('game-date');
    const beforeNext = await matchDate.innerText();
    await page.getByTestId('match-next-action').click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByTestId('calendar').getByTestId('game-date')).toHaveText(beforeNext);
    await watchNext(page);
    await expect(matchDate).not.toHaveText(beforeNext);
    await expect(page.getByTestId('match-next-action')).toBeEnabled();
    await expectCompactMatch(page, viewport);
    await expect(page.getByRole('button', { name: '경기 상세', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(result).toBeVisible();
    const nextSaved = (await decode(await savedRaw(page))).world;
    expect(nextSaved.ownMatches).toHaveLength(2);
    expect(nextSaved.ownMatches[1]).toEqual(reference.ownMatches[1]);
    await expectCompactMatch(page, viewport);
  });
}

test('an archived replay holds each goal it crosses, keeps a pause and skips what a seek passes', async ({
  page,
}) => {
  // Two goal crossings at the speed the archived replay opens at: two minutes of the clock (12 s
  // at 2x), then one after a seek (6 s); the replay has no speed chips to raise it.
  test.slow();
  const replayMinuteMs = WATCH_MINUTE_MS / WATCH_DEFAULT_SPEED;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  // A settled revision-1 match keeps its recorded facts after a writer upgrades the career.
  // The archived replay exercises those historical goals, independent of the current model. The
  // club taken over from goal-feedback-207 scores at 2′, then concedes at 4′ and 40′ (T687, found
  // by a scan in Node: goal-feedback-221's founded career had the same shape at 2′, 13′ and 32′).
  const world = careerWorld(
    { country: 'ENG', seed: 'goal-feedback-207' },
    { revision: 'continuous-aggregate-1', enabled: true },
  );
  world.settings!.responsibilities.sales = 'delegated';
  const played = advanceToNextMatch(world)!.record;
  expect(played.highlights.map((goal) => goal.minute)).toEqual([2, 4, 40]);
  await importResponsibilityCareer(page, world);
  const replay = await openRecordedMatch(page);
  const cue = replay.getByTestId('goal-cue');
  const score = replay.getByTestId('match-score').locator('strong');
  // The page presses 일시정지 on the frame a cue appears: the cue holds one second, less than
  // Playwright's polling and click take on a slow WebKit runner (CI 41154314385).
  const pauseOnCue = (timeout: number) =>
    page.waitForFunction(
      () => {
        const pause = document
          .querySelector('[data-testid="goal-cue"]')
          ?.closest('[role="dialog"]')
          ?.querySelector<HTMLButtonElement>('button[aria-label="일시정지"]');
        pause?.click();
        return !!pause;
      },
      undefined,
      { polling: 'raf', timeout },
    );
  await pauseOnCue(2 * replayMinuteMs + 5000);
  await expect(cue).toContainText(played.highlights[0]!.player);
  await expect(score).toHaveText('1 : 0');
  // A pause during the hold keeps the cue until playback resumes.
  await page.waitForTimeout(1500);
  await expect(cue).toBeVisible();
  await replay.getByRole('button', { name: '재생', exact: true }).click();
  await expect(cue).toHaveCount(0, { timeout: 3000 });
  // Paused again, a seek in 경기 상세 past both later goals stays there without celebrating them;
  // the details hold the replay while open and leave it paused, as it was, once closed.
  await replay.getByRole('button', { name: '일시정지', exact: true }).click();
  await replay.getByRole('button', { name: '경기 상세', exact: true }).click();
  const scrubber = matchDetails(page).getByRole('slider', { name: '경기 시간', exact: true });
  await scrubber.fill('80');
  await expect(score).toHaveText('1 : 2');
  await expect(cue).toHaveCount(0);
  await expect(replay.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  // Going back before the 4′ goal lets playback cross it again: one sample a minute, the one
  // before its minute's (as 11 stood before a 13′ goal).
  await scrubber.fill('2');
  await expect(score).toHaveText('1 : 0');
  await closeMatchDetails(page);
  await replay.getByRole('button', { name: '재생', exact: true }).click();
  await pauseOnCue(replayMinuteMs + 4000);
  await expect(cue).toBeVisible();
  await expect(score).toHaveText('1 : 1');
  await expect(replay.getByTestId('goal-score')).toHaveText('1');
});
