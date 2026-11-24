import { clubhouseTab } from './competition-navigation';
import {
  ALL_DELEGATED,
  configureResponsibilities,
  acknowledgeEvents,
  dismissMatchReport,
  eventCard,
} from './events';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

async function identity(page: Page) {
  const year = await page.getByTestId('calendar').getAttribute('data-season');
  const round = await page.getByTestId('game-round').innerText();
  if (!year || !round) throw new Error('Missing season identity');
  return { year: Number(year), round: Number(round) };
}
async function manual(page: Page, all = false) {
  await dismissMatchReport(page);
  await clubhouseTab(page).click();
  await configureResponsibilities(page, {
    responsibilities: all ? ALL_DELEGATED : { recruitment: 'delegated', sales: 'delegated' },
    mode: 'manual',
    observations: { matchEve: true, windowOpen: false },
  });
}
/**
 * How long one engine step may hold the controls. The step from a season's last match to the next
 * season's first match eve took 5.2 s in Node (records-room-journey, 261124), its close alone
 * 2.1 s, and CI runs such steps several times slower than Node: one went past a 30 s wait.
 */
const STEP_MS = 120_000;
/** How long a click may take to lock the controls, or a released lock to show its result. */
const IDLE_MS = 10_000;
/**
 * Waits until the step `control`'s click asked for shows `moved`. While the control stays locked
 * (→WEB-97) the engine is working on that step: a long step reports itself every second and the
 * client fails an engine worker only after two minutes of silence, so a long wait here is a step
 * at work. A click that never locks the control, or a lock released without the result, fails
 * early.
 */
async function stepSettles(control: Locator, moved: () => Promise<boolean>, step: string) {
  let state = 'starting',
    idleSince = Date.now();
  await expect
    .poll(
      async () => {
        if (await moved()) return (state = 'moved');
        // Read without auto-waiting: an inert or replaced control is simply not locked.
        if (
          await control.evaluateAll((buttons) =>
            buttons.some((button) => (button as HTMLButtonElement).disabled),
          )
        ) {
          idleSince = Date.now();
          return (state = 'working');
        }
        return (state = Date.now() - idleSince > IDLE_MS ? 'idle' : 'starting');
      },
      { timeout: STEP_MS, message: `${step} still at work after ${STEP_MS} ms` },
    )
    .toMatch(/^(moved|idle)$/);
  expect(state, `${step} ran no step, or its step ended without a result`).toBe('moved');
}
/** Each journey's budget and when its first real event started, kept across helper calls. */
const journeyClocks = new WeakMap<TestInfo, { budget: number; started: number }>();
/**
 * Journeys that play real events grow their test budget with each event that lands, leaving every
 * next one a whole step's time (STEP_MS), so a step that stops still fails. A fixed budget counted
 * steps that differ by host: the contract-talk journey's six weeks took 2.9-3.3 min on one host
 * against its 180 s (main 45339146352).
 */
function extendForEvents() {
  const info = test.info();
  let clock = journeyClocks.get(info);
  if (!clock)
    journeyClocks.set(
      info,
      (clock = { budget: Math.max(info.timeout, 180000), started: Date.now() }),
    );
  test.setTimeout(clock.budget + (Date.now() - clock.started) + STEP_MS);
}
async function requestNextEvent(page: Page, moved: () => Promise<boolean>) {
  // The prior owner decision publishes its view before the engine commits the save.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const next = page.getByRole('button', { name: '다음 이벤트', exact: true });
  await next.click();
  await stepSettles(next, moved, '다음 이벤트');
}

/** Resolve real observation cards and advance only through the public next-event/match actions. */
export async function advanceManualEvent(page: Page) {
  const pill = page.getByTestId('event-pill');
  if (await pill.isVisible()) await pill.click();
  await acknowledgeEvents(page);
  const match = eventCard(page).filter({ hasText: '내일 경기' });
  const date = page.getByTestId('game-date');
  const before = await date.innerText();
  if (!(await match.isVisible()))
    // A reopened report has the same date. A completed step can publish a date without a card.
    await requestNextEvent(
      page,
      async () =>
        (await eventCard(page).first().isVisible()) || (await date.innerText()) !== before,
    );
  if ((await match.isVisible()) && (await date.innerText()) === before) {
    const through = match.getByRole('button', { name: '결과만 보고 계속', exact: true });
    await through.click();
    // The worker plays the match on the released model first, behind the eve's own save.
    await stepSettles(through, async () => (await match.count()) === 0, '결과만 보고 계속');
  }
  await expect(date).not.toHaveText(before);
}
/** One domestic round, allowing cup fixtures and real event stops between league fixtures. */
export async function advanceOneRound(page: Page) {
  const wasManual =
    (await page.getByRole('button', { name: '다음 이벤트', exact: true }).count()) > 0;
  extendForEvents();
  await manual(page);
  const initial = await identity(page);
  for (let event = 0; event < 40; event++, extendForEvents()) {
    const now = await identity(page);
    if (now.year !== initial.year || now.round > initial.round) {
      if (!wasManual) await configureResponsibilities(page, { mode: 'automatic' });
      return;
    }
    await advanceManualEvent(page);
  }
  throw new Error('No next domestic round after forty real stopping events');
}
/** Finish the observed season; fixture/event identity, rather than a fixed click count, ends it. */
export async function finishSeason(page: Page) {
  // About 42 match eves a season, each a next-event and a match day with an owner decision's save
  // in the engine worker before the next step (→SAVE-3/8): 85 steps took 81 s in Node, and a fixed
  // 420 s ran out on CI (main 44697908305), so the budget grows with each event (extendForEvents).
  extendForEvents();
  await manual(page, true);
  const initial = await identity(page);
  for (let event = 0; event < 240; event++, extendForEvents()) {
    if ((await identity(page)).year !== initial.year) {
      await configureResponsibilities(page, {
        mode: 'automatic',
        observations: { matchEve: false, windowOpen: false },
      });
      return;
    }
    await advanceManualEvent(page);
  }
  throw new Error('Season did not close after 240 real stopping events');
}
