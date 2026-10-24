import { expect, type Page } from '@playwright/test';
import type { MatchPlayback } from '../../packages/contracts/src/types';
import {
  presentationMs,
  presentationSamples,
  SET_PIECE_PREPARATION_MS,
  setPiecePreparations,
  type Preparation,
} from '../../apps/web/src/ui/presentationClock';

/** Match seconds of running play the seek lands before the dead ball, so 1x reaches it visibly. */
const LEAD_SECONDS = 3;
/** Real ms recorded beyond the clock's own time to the kick: the click landing and a few frames. */
const RECORD_SLACK_MS = 2000;

/**
 * The first set-piece preparation (→WEB-32) of a reference playback that starts after the opening
 * minutes and lasts at least `minSeconds` of match time, so 1x shows its compression plainly.
 */
export function longPreparation(playback: MatchPlayback, minSeconds = 20) {
  const preparation = setPiecePreparations(playback.frames).find(
    ({ from, to }) => from >= 120 && to - from >= minSeconds,
  );
  if (!preparation) throw new Error(`no set-piece preparation of ${minSeconds} s or more`);
  return preparation;
}

/**
 * Seeks the open match details to a recorded sample at least `LEAD_SECONDS` before `preparation`,
 * starts recording the presented running second (the pitch canvas's `data-seconds`) on every
 * animation frame while still paused there, resumes at 1x and records until the kick has passed.
 * The preparation must be drawn in about `SET_PIECE_PREPARATION_MS`, far quicker than its running
 * time at 1x, while the clock passes through many instants inside it in small steps: the players are
 * drawn travelling their recorded routes, interpolated between samples, never jumping to their
 * places.
 */
export async function expectCompressedPreparation(
  page: Page,
  playback: MatchPlayback,
  preparation: Preparation,
) {
  const { from, to } = preparation;
  const { times } = presentationSamples(playback.frames);
  const before = times.findLastIndex((time) => time <= from - LEAD_SECONDS);
  expect(before).toBeGreaterThanOrEqual(0);
  const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
  await timeline.fill(String(before));
  await expect(timeline).toHaveValue(String(before));
  const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
  // The page samples its own playback, which Firefox and WebKit may sample a few points apart from
  // the Node reference, so the seek is checked by match time: step back until it is before the
  // dead ball with time to spare.
  const shown = async () => Number(await canvas.getAttribute('data-seconds'));
  await expect.poll(shown).toBeGreaterThan(0);
  for (let step = 0; step < 40 && (await shown()) > from - 1; step++) {
    await timeline.press('ArrowLeft');
    await page.waitForTimeout(50);
  }
  const sought = await shown();
  expect(sought, 'the seek lands before the dead ball').toBeLessThanOrEqual(from - 1);
  // The recorder starts on the paused seek, so it holds the clock's place before the dead ball
  // whatever the click costs; selecting a speed then resumes the seek (→WEB-32).
  const recordMs = presentationMs(sought, to, 1, [preparation]) + RECORD_SLACK_MS;
  const recording = canvas.evaluate(
    (element, ms) =>
      new Promise<[number, number][]>((resolve) => {
        const out: [number, number][] = [];
        const start = performance.now();
        const tick = (now: number) => {
          out.push([now - start, Number((element as HTMLElement).dataset.seconds)]);
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    recordMs,
  );
  await page.getByRole('radio', { name: '1×', exact: true }).click();
  const records = await recording;
  expect(records[0]![1], 'recording began on the paused seek').toBeLessThanOrEqual(from);
  const enteredAt = records.findLastIndex(([, seconds]) => seconds <= from);
  const kickedAt = records.findIndex(([, seconds]) => seconds >= to);
  expect(kickedAt, 'the clock reached the kick').toBeGreaterThan(enteredAt);
  // Drawn in about 1.5 s, against more than 4 s of running play at 1x.
  const drawnMs = records[kickedAt]![0] - records[enteredAt]![0];
  const runningMs = presentationMs(from, to, 1);
  expect(runningMs).toBeGreaterThan(4000);
  expect(drawnMs).toBeGreaterThanOrEqual(SET_PIECE_PREPARATION_MS - 100);
  expect(drawnMs).toBeLessThan(Math.min(SET_PIECE_PREPARATION_MS + 1000, runningMs * 0.6));
  // Many drawn instants inside the preparation, each a small step of it: no position jump.
  const inside = records.slice(enteredAt, kickedAt + 1).map(([, seconds]) => seconds);
  expect(inside.filter((seconds) => seconds > from && seconds < to).length).toBeGreaterThan(10);
  for (let k = 1; k < inside.length; k++)
    expect(inside[k]! - inside[k - 1]!).toBeLessThanOrEqual((to - from) / 5);
}
