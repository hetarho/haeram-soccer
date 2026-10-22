import { expect, test } from '@playwright/test';
import type { PlayerMotion, World } from '../../packages/contracts/src/types';
import { advanceToNextMatch, createWorld } from '../../packages/engine/src/index';
import { presentationSamples } from '../../apps/web/src/ui/presentationClock';
import { withCandidateModel } from '../fixtures/worlds';
import { horizontalOverflow } from './layout';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { watchNext } from './watch';

/**
 * Both sides through a delivered set piece in observation (→MATCH-12, MATCH-17, MATCH-18, T348).
 * Marked synthetic career: a fresh founding on the candidate match model (the release switch stays
 * off; `withCandidateModel` stands in for the activation writer), every responsibility delegated so
 * nothing holds the watch. The scene is the engine's own recorded one: a reference run of the same
 * seeded match finds the first delivery the defenders keep their set-piece jobs through, and the
 * page is paused on those recorded samples.
 */
function career(): World {
  const w = createWorld({
    country: 'ENG',
    name: 'Set Piece Defence',
    color: '#224466',
    seed: 'set-piece-defence',
    level: 'easy',
  });
  const settings = w.settings!;
  for (const key of Object.keys(
    settings.responsibilities,
  ) as (keyof typeof settings.responsibilities)[])
    settings.responsibilities[key] = 'delegated';
  return withCandidateModel(w);
}

type Who = { side: 0 | 1; index: number };
/** A set-piece job the engine recorded: committed, still held, taken at the kick `since`. */
const held = (p: PlayerMotion, since?: number) =>
  !!p.intention &&
  !p.intention.ended &&
  p.intention.priority === 'committed' &&
  (since === undefined || p.intention.since === since);

/**
 * The compact recorded scene: the samples, in the page's own order, through the first delivery
 * after which at least six defenders hold set-piece jobs for several samples; a marker and the man
 * he marks who keeps his box spot, a zone guard and the defending keeper throughout.
 */
function recordedScene() {
  const playback = advanceToNextMatch(career())!;
  const { samples } = presentationSamples(playback.frames);
  const jobsOf = (k: number, side: 0 | 1) =>
    samples[k]!.players![side].filter(
      (p) => held(p) && (p.intention!.kind === 'mark' || p.intention!.kind === 'cover'),
    );
  for (let k = 0; k < samples.length; k++)
    for (const side of [0, 1] as const) {
      const first = jobsOf(k, side);
      if (first.length < 6) continue;
      const { since, until } = first[0]!.intention!;
      const run: number[] = [];
      for (let j = k; j < samples.length; j++) {
        const jobs = jobsOf(j, side).filter((p) => p.intention!.since === since);
        const frame = playback.frames[samples[j]!.frame]!;
        // Inside the jobs' window and the minute: a sample during a later restart's preparation
        // still shows the last recorded snapshot.
        const elapsed = frame.startSeconds! + samples[j]!.time - 60 * samples[j]!.frame;
        if (jobs.length < 6 || samples[j]!.frame !== samples[k]!.frame || elapsed > until) break;
        run.push(j);
      }
      if (run.length < 2) continue;
      const at = [run[0]!, run.at(-1)!];
      const att = side === 0 ? 1 : 0;
      const find = (s: 0 | 1, ok: (p: PlayerMotion, i: number) => boolean) =>
        samples[at[0]!]!.players![s].find((p) =>
          at.every((i) => {
            const q = samples[i]!.players![s].find((x) => x.id === p.id);
            return !!q && ok(q, i);
          }),
        );
      const marker = find(
        side,
        (p, i) =>
          held(p, since) &&
          p.intention!.kind === 'mark' &&
          samples[i]!.players![att].some(
            (o) => o.id === p.intention!.opponent && o.state === 'run' && held(o, since),
          ),
      );
      const guard = find(
        side,
        (p) => held(p, since) && p.intention!.kind === 'cover' && p.state === 'mark',
      );
      const keeper = find(side, (p) => p.state === 'keeper' && held(p, since));
      if (!marker || !guard || !keeper) continue;
      const who = (s: 0 | 1, id: string): Who => ({
        side: s,
        index: playback.squads[s].findIndex((p) => p.id === id),
      });
      return {
        samples: samples.length,
        at,
        label: playback.frames[samples[k]!.frame]!.label,
        marker: who(side, marker.id),
        runner: who(att, marker.intention!.opponent!),
        guard: who(side, guard.id),
        keeper: who(side, keeper.id),
      };
    }
  throw new Error('no delivery the defenders hold in the reference match');
}

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
])
  test(`shows both sides through a delivered set piece on ${viewport.name}`, async ({ page }) => {
    test.slow();
    await page.setViewportSize(viewport);
    const scene = recordedScene();
    await importResponsibilityCareer(page, career());
    await watchNext(page);
    const canvas = page.getByLabel('22명의 선수와 공으로 표현하는 경기');
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: '경기 상세', exact: true }).click();
    const timeline = page.getByRole('slider', { name: '경기 시간', exact: true });
    // The page plays the reference's recorded match: the same samples.
    await expect(timeline).toHaveAttribute('max', String(scene.samples - 1));
    await page.getByRole('button', { name: '선수 판단 보기', exact: true }).click();
    const inspector = page.getByRole('combobox', { name: '살펴볼 선수', exact: true });
    const state = page
      .locator('p')
      .filter({ hasText: '점선은 이 선수가 선택한 이동' })
      .locator('b');
    // From the delivery's landing to the second ball, the defenders keep their jobs: the marker
    // with his man, who holds his box spot, the zone guarded, the keeper on his goal.
    for (const index of scene.at) {
      await timeline.fill(String(index));
      await expect(timeline).toHaveValue(String(index));
      await expect(page.getByTestId('match-latest-event').locator('span')).toHaveText(
        `${scene.label}′`,
      );
      for (const [who, label] of [
        [scene.marker, '상대 마크'],
        [scene.runner, '빈 공간 침투'],
        [scene.guard, '상대 마크'],
        [scene.keeper, '골문 보호'],
      ] as const) {
        await chooseOption(inspector, `${who.side}:${who.index}`);
        await expect(state).toHaveText(label);
      }
      await expect(canvas).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }
  });
