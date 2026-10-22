import { watchNext } from './watch';
import { configureResponsibilities } from './events';
import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  advanceToNextMatch,
  clubOf,
  createWorld,
  lineupSummary,
  nextOwnFixture,
  startingSquad,
  tacticLabel,
} from '../../packages/engine/src/index';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { expectViewFits, settle } from './layout';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import { openRecordedMatch } from './club-identity-helpers';
import { importResponsibilityCareer } from './responsibility-fixtures';

async function savedRaw(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return page.evaluate(() => {
    const manifest = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    return localStorage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)!;
  });
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
    const controls = [...theatre.querySelectorAll('button,select')].filter(
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
  await expectViewFits(page);
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
    const founding = {
      country: 'ENG' as const,
      name: 'Haeram Athletic',
      color: '#bf7956',
      seed: `match-core-${viewport.width}`,
      level: 'easy' as const,
    };
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(founding.seed);
    await page.getByRole('button', { name: '클럽 창단' }).click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    // Founding sends the design draft made when the screen opened (→KIT-14), so the reference is
    // founded with the identity the browser confirmed; the match facts use no identity draws.
    const identity = clubOf((await decode(await savedRaw(page))).world).identity;
    const reference = createWorld({ ...founding, identity });
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
    await expect(page.getByRole('radio', { name: '1×', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
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
    // 250 ms (→WEB-32): a second covers several minutes without slowing at a dead ball.
    const minuteNow = async () =>
      Number(
        (await page.getByTestId('match-latest-event').locator('span').innerText()).match(
          /\d+/,
        )?.[0] ?? 0,
      );
    const before = await minuteNow();
    await page.getByRole('radio', { name: '16×', exact: true }).click();
    expect(await minuteNow()).toBeGreaterThanOrEqual(before);
    // A goal's hold (→WEB-94) is real time outside running play, so it may sit inside the second.
    await page.waitForTimeout(1000 + GOAL_FEEDBACK_CONFIG.holdMs);
    expect((await minuteNow()) - before).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: '결과 보기', exact: true }).click();
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
    // The scoreboard carries one red mark per player sent off; the event line its minute label.
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
    // The pre-match world is founded with the reference's own design, however that was founded.
    const founded = createWorld({ ...founding, identity: clubOf(reference).identity });
    expect(reference.ownMatches[0].appearance).toEqual(
      appearanceForFixture(founded, nextOwnFixture(founded)!),
    );
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toHaveCount(0);
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expect(page.getByRole('slider', { name: '경기 시간', exact: true })).toBeVisible();
    // The scrubber reads the presented frame's label against the last one.
    await expect(page.getByText(/^(90(\+\d+)?)′ \/ \1′$/)).toBeVisible();
    const actionBounds = await page.getByTestId('match-next-action').boundingBox();
    const detailBounds = await page
      .getByRole('slider', { name: '경기 시간', exact: true })
      .boundingBox();
    const menuBounds = await page
      .getByRole('navigation', { name: '모바일 게임 메뉴' })
      .boundingBox();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(menuBounds!.y);
    expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(detailBounds!.y);
    await expect(page.getByText('패스 성공', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '경기 뒤의 순위표' })).toBeVisible();
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '살펴볼 선수', exact: true })).toBeVisible();
    if (sentOff[0] + sentOff[1])
      await expect(page.getByTestId('match-bench').filter({ hasText: '(퇴장)' })).not.toHaveCount(
        0,
      );
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await expectCompactMatch(page, viewport);
    await nav.getByRole('button', { name: '리그', exact: true }).click();
    const leagueTabs = page.getByRole('tablist', { name: '리그 보기' }).getByRole('tab');
    await expect(leagueTabs).toHaveText(['순위표', '일정·결과', '팀 기록', '선수 기록']);
    for (const tab of await leagueTabs.all()) {
      const bounds = await tab.boundingBox();
      expect(bounds!.width, await tab.innerText()).toBeGreaterThanOrEqual(44);
      expect(bounds!.height, await tab.innerText()).toBeGreaterThanOrEqual(44);
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
    // Going back returns to the theatre while its playback lasts.
    await page.goBack();
    await expectCompactMatch(page, viewport);
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    await page.getByText('주요 장면 탐색', { exact: true }).click();
    // Red cards and substitutions join the goals, labelled with their minute (45+n, 90+n).
    await expect(page.getByTestId('recorded-incident')).toHaveCount(
      incidents.filter((i) => i.kind === 'red' || i.kind === 'secondYellow' || i.kind === 'sub')
        .length,
    );
    for (const incident of incidents.filter((i) => i.kind === 'sub'))
      await expect(
        page
          .getByTestId('recorded-incident')
          .filter({ hasText: `${incident.minute}${incident.added ? `+${incident.added}` : ''}′` })
          .filter({ hasText: '↔' }),
      ).not.toHaveCount(0);
    await page.getByRole('button', { name: '킥오프 · 1분', exact: true }).click();
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
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
      .getByRole('button', { name: '전술·선발 준비', exact: true });
    await prepare.click();
    const preparation = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    await expect(preparation).toBeVisible();
    // The settled match on screen offers no shirt choice; only the next fixture does (→WEB-88).
    const upcoming = nextOwnFixture(reference)!;
    expect(upcoming.id).not.toBe(first.record.id);
    await expect(preparation.getByTestId('fixture-kit')).toHaveAttribute(
      'data-fixture-id',
      upcoming.id,
    );
    await preparation.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
    await expect(preparation).toHaveCount(0);
    await expect(prepare).toBeFocused();
    await expect(result).toContainText(`${ownGoals}–${otherGoals}`);
    expect(await savedRaw(page)).toBe(settled);
    advanceToNextMatch(reference);
    const beforeNext = await page.getByTestId('game-date').innerText();
    await page.getByTestId('match-next-action').click();
    await expect(page.getByTestId('club-hub')).toBeVisible();
    await expect(page.getByTestId('game-date')).toHaveText(beforeNext);
    await watchNext(page);
    await expect(page.getByTestId('game-date')).not.toHaveText(beforeNext);
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
  // Two goal crossings at 1x on the archived clock: about 8 s, then 4 s after a seek.
  test.slow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  // The first match of this founding scored 2′ (home), 46′ and 66′ (away).
  const world = createWorld({
    country: 'ENG',
    name: 'Goal Feedback',
    color: '#224466',
    seed: 'goal-feedback',
    level: 'easy',
  });
  world.settings!.responsibilities.sales = 'delegated';
  const played = advanceToNextMatch(world)!.record;
  expect(played.highlights.map((goal) => goal.minute)).toEqual([2, 46, 66]);
  await importResponsibilityCareer(page, world);
  const replay = await openRecordedMatch(page);
  const cue = replay.getByTestId('goal-cue');
  const score = replay.getByTestId('match-score').locator('strong');
  await expect(cue).toBeVisible({ timeout: 15_000 });
  await expect(cue).toContainText(played.highlights[0]!.player);
  await expect(score).toHaveText('1 : 0');
  // A pause during the hold keeps the cue until playback resumes.
  await replay.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.waitForTimeout(1500);
  await expect(cue).toBeVisible();
  await replay.getByRole('button', { name: '재생', exact: true }).click();
  await expect(cue).toHaveCount(0, { timeout: 3000 });
  // A seek past both later goals pauses there without celebrating them.
  await replay.getByRole('button', { name: '경기 상세', exact: true }).click();
  const scrubber = replay.getByRole('slider', { name: '경기 시간', exact: true });
  await scrubber.fill('80');
  await expect(score).toHaveText('1 : 2');
  await expect(cue).toHaveCount(0);
  await expect(replay.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  // Going back before the 46′ goal lets playback cross it again.
  await scrubber.fill('44');
  await expect(score).toHaveText('1 : 0');
  await replay.getByRole('button', { name: '재생', exact: true }).click();
  await expect(cue).toBeVisible({ timeout: 10_000 });
  await expect(score).toHaveText('1 : 1');
  await expect(replay.getByTestId('goal-score')).toHaveText('1');
});
