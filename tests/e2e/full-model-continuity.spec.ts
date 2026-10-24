import { expect, test, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import { canonical } from '../../packages/contracts/src/index';
import { MATCH_MODEL_REVISION } from '../../packages/contracts/src/match-model';
import { MANAGER_HISTORY_CHECKPOINT_SCHEMA } from '../../packages/contracts/src/versions';
import { GOAL_FEEDBACK_CONFIG } from '../../apps/web/src/ui/goalFeedback';
import { continuityCareer, FAST_MINUTE_MS, FAST_SPEED } from '../fixtures/full-model-continuity';
import { exportRaw, exportWorld } from './club-identity-helpers';
import { horizontalOverflow } from './layout';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { watchNext } from './watch';

/**
 * A supported career activated mid-season on the full match model (T402; →SAVE-22/23, HIST-17,
 * WEB-89/94/95, KIT-12), imported into the build, whose release switch stays off: the career plays
 * on under the model it recorded. Earlier results keep their pre-feature records and the league
 * names where counting started; the watched match runs at a uniform pace with its goals held and
 * cued in order, the ball owner shown and the set-piece shapes recorded (T348); save, reload, export
 * and import keep the aggregates, the tracking boundary and the saved appearances.
 */
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const nav = (page: Page) =>
  page.getByRole('navigation', {
    name: page.viewportSize()!.width < 760 ? '모바일 게임 메뉴' : '게임 메뉴',
    exact: true,
  });
/** The own league's coverage line in its player records (→WEB-89). */
async function coverageLine(page: Page) {
  await nav(page).getByRole('button', { name: '리그', exact: true }).click();
  await page.getByRole('tab', { name: '선수 기록', exact: true }).click();
  return page
    .getByRole('region', { name: '선수 세부 기록', exact: true })
    .getByTestId('full-stats-coverage');
}
/** This season's own matches in the records room. */
async function seasonMatches(page: Page) {
  await nav(page).getByRole('button', { name: '클럽 기록실', exact: true }).click();
  await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
  await page.getByRole('table', { name: '시즌별 기록' }).getByRole('button').first().click();
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  return (round: number, score: { home: number; away: number }) =>
    page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: String(round), exact: true }) })
      .filter({ hasText: `${score.home}–${score.away}` });
}
const minuteNow = async (page: Page) =>
  Number(
    (await page.getByTestId('match-latest-event').locator('span').innerText()).match(/\d+/)![0],
  );

for (const viewport of VIEWPORTS)
  test(`continues a mid-season activated career on ${viewport.name}`, async ({ page, browser }) => {
    test.slow();
    await page.setViewportSize(viewport);
    const { world, coverage, from, untracked, next } = continuityCareer();
    await importResponsibilityCareer(page, world);

    // Counting starts at the activation: the earlier matches are untracked, never zero.
    await expect(await coverageLine(page)).toHaveText(coverage);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Manual mode: leaving the match never resumes the calendar, so the saved career stays put.
    await watchNext(page, { manual: true });
    // Scores, cues and ownership the page presents, each as it changes.
    await page.evaluate(() => {
      const score = document.querySelector('[data-testid="match-score"]')!;
      const seen = {
        scores: [score.querySelector('strong')?.textContent ?? ''],
        cues: [] as { side: string; text: string }[],
        owners: new Set<string>(),
        held: false,
      };
      const read = () => {
        const text = score.querySelector('strong')?.textContent ?? '';
        if (text !== seen.scores.at(-1)) seen.scores.push(text);
        seen.owners.add(
          `${score.getAttribute('data-possession')}:${score.getAttribute('data-possession-side') ?? '-'}`,
        );
      };
      new MutationObserver(read).observe(score, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      new MutationObserver((records) => {
        for (const record of records)
          for (const added of record.addedNodes)
            if (added instanceof HTMLElement && added.dataset.testid === 'goal-cue')
              seen.cues.push({ side: added.dataset.side ?? '', text: added.textContent ?? '' });
      }).observe(document.body, { childList: true, subtree: true });
      Object.assign(window, { continuity: seen });
    });
    const seen = () =>
      page.evaluate(() => {
        const state = (
          window as unknown as {
            continuity: {
              scores: string[];
              cues: { side: string; text: string }[];
              owners: Set<string>;
            };
          }
        ).continuity;
        return { scores: state.scores, cues: state.cues, owners: [...state.owners] };
      });
    // The side on the ball shows beside the scoreboard without opening details (→WEB-95).
    const badge = page.getByTestId('match-score').getByTestId('possession-cue');
    await expect(badge).toHaveCount(1, { timeout: 10_000 });
    await expect(badge).toHaveAccessibleName('볼 소유');

    // At 16x every running minute lasts 750 ms; only a goal's hold (→WEB-94) takes time out. The
    // whole match at that speed is the slowest part of this journey. The pitch advances its clock
    // at most 60 ms a frame (Pitch.tsx), so a slow CI browser (WebKit's frames run past 100 ms)
    // takes up to about three times the nominal watch.
    const watchBudgetMs = 3 * next.watchMs;
    test.info().setTimeout(test.info().timeout + watchBudgetMs);
    const speeds = page.getByRole('radiogroup', { name: '관전 속도', exact: true });
    await speeds.getByRole('radio', { name: `${FAST_SPEED}×`, exact: true }).click();
    const before = { minute: await minuteNow(page), cues: (await seen()).cues.length };
    const held = await page.getByTestId('goal-cue').count();
    await page.waitForTimeout(8 * FAST_MINUTE_MS);
    const covered = (await minuteNow(page)) - before.minute;
    const holds = (await seen()).cues.length - before.cues + held;
    // Below its nominal rate on a slow browser, three of the eight nominal minutes still tell a
    // running 16x clock from a stalled or 1x one (1x would cover half a minute).
    expect(covered).toBeGreaterThanOrEqual(
      3 - (holds * GOAL_FEEDBACK_CONFIG.holdMs) / FAST_MINUTE_MS,
    );
    expect(covered).toBeLessThanOrEqual(10);
    await expect(page.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible({
      timeout: watchBudgetMs + 10_000,
    });
    await expect(page.getByTestId('goal-cue')).toHaveCount(0, { timeout: 3000 });

    // Each goal held and cued once, in order, its side named, with the running score after it.
    const presented = await seen();
    expect(presented.scores).toEqual(['0 : 0', ...next.scores]);
    expect(presented.cues.map((cue) => Number(cue.side))).toEqual(next.sides);
    expect(presented.cues.every((cue) => cue.text.startsWith('GOAL'))).toBe(true);
    expect(presented.owners).toEqual(expect.arrayContaining(['carrier:0', 'carrier:1']));

    // The newly settled match reports complete records.
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    const report = page.getByRole('region', { name: '경기 분석 리포트', exact: true });
    await expect(report).toBeVisible();
    await expect(report).toContainText('xG');
    await expect(report).not.toContainText('기록하기 전 규칙');
    // The recorded set-piece shape: six or more defenders on their jobs, a marker with his man.
    const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
    await expect(timeline).toHaveAttribute('max', String(next.samples - 1));
    await timeline.fill(String(next.setPiece.index));
    await expect(timeline).toHaveValue(String(next.setPiece.index));
    await expect(page.getByTestId('match-latest-event').locator('span')).toHaveText(
      `${next.setPiece.label}′`,
    );
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    const { side, index } = next.setPiece.marker;
    await chooseOption(
      page.getByRole('combobox', { name: '살펴볼 선수', exact: true }),
      `${side}:${index}`,
    );
    await expect(
      page.locator('p').filter({ hasText: '점선은 이 선수가 선택한 이동' }).locator('b'),
    ).toHaveText('상대 마크');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // The seek left the match before its end: reveal the result again, then go home.
    const action = page.getByTestId('match-next-action');
    if ((await action.getAttribute('aria-label')) === '결과 보기') await action.click();
    await expect(action).toHaveAccessibleName('홈으로');
    await action.click();
    await expect(page.getByTestId('club-hub')).toBeVisible();

    // The league still names where counting started and the matches before it.
    const line = await coverageLine(page);
    await expect(line).toContainText(from);
    await expect(line).toContainText(`그 전 ${untracked}경기는 기록 없음`);
    const played = await line.innerText();
    // Earlier results keep their pre-feature records beside the new one.
    const row = await seasonMatches(page);
    for (const match of world.ownMatches)
      await expect(row(match.round, match.score).first()).toBeVisible();
    const exported = (await decode(await exportRaw(page))).world;
    const settled = exported.ownMatches.find((match) => match.id === next.id)!;
    await expect(row(settled.round, settled.score).first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Saved, reloaded, exported and imported: the same aggregates, boundary and appearances.
    await expect(page.getByTestId('save-status')).toContainText('저장 완료');
    await page.reload();
    await expect(nav(page).getByRole('button', { name: '리그', exact: true })).toBeVisible();
    // The records load after the page: wait for the line rather than read it at once.
    await expect(await coverageLine(page)).toHaveText(played);
    const raw = await exportRaw(page);
    const file = await decode(raw);
    // A tracked career keeps its model data in the manager-history container (→SAVE-23/24).
    expect(file.envelope.schema).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    const saved = file.world;
    expect(saved.matchModel).toEqual(world.matchModel);
    expect(saved.npcSeason!.trackedFrom).toEqual(world.matchModel!.trackedFrom);
    expect(saved.npcSeason!.competitions.length).toBeGreaterThan(0);
    expect(canonical(saved.npcSeason)).toBe(canonical(exported.npcSeason));
    expect(canonical(saved.ownMatches.slice(0, world.ownMatches.length))).toBe(
      canonical(world.ownMatches),
    );
    const kept = saved.ownMatches.find((match) => match.id === next.id)!;
    expect(kept.model).toBe(MATCH_MODEL_REVISION);
    expect(kept.appearance).toBeDefined();
    expect(`${kept.score.home} : ${kept.score.away}`).toBe(next.scores.at(-1));
    expect(saved.ownMatches.map((match) => match.appearance)).toEqual(
      exported.ownMatches.map((match) => match.appearance),
    );

    // The file alone carries the career into another browser profile.
    const elsewhere = await browser.newContext({ viewport });
    try {
      const other = await elsewhere.newPage();
      await other.goto(new URL('/', page.url()).href);
      await expect(other.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
      await other
        .locator('input[type=file]')
        .last()
        .setInputFiles({
          name: 'full-model.haeram-save.json',
          mimeType: 'application/json',
          buffer: Buffer.from(raw),
        });
      await expect(other.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
      expect(canonical(await exportWorld(other))).toBe(canonical(saved));
      await expect(await coverageLine(other)).toHaveText(played);
    } finally {
      await elsewhere.close();
    }
  });
