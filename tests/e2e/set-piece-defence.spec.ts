import { expect, test } from '@playwright/test';
import type { PlayerMotion, World } from '../../packages/contracts/src/types';
import { advanceToNextMatch, createWorld } from '../../packages/engine/src/index';
import { presentationSamples } from '../../apps/web/src/ui/presentationClock';
import { withCandidateModel } from '../fixtures/worlds';
import { horizontalOverflow } from './layout';
import { expectCompressedPreparation, stoppages } from './preparation';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { chooseOption } from './select';
import { watchNext } from './watch';

/**
 * Both sides through a delivered set piece in observation (→MATCH-12, MATCH-17, MATCH-18, T348),
 * from the walk-in to its recorded kick (T359) to the second ball. Marked synthetic career: a fresh
 * founding on the released match model (`withCandidateModel` keeps it explicit whatever the switch
 * says), every responsibility delegated so nothing holds the watch. The
 * scene is the engine's own recorded one: a reference run of the same seeded match finds the first
 * delivery the defenders keep their set-piece jobs through, and the page is paused on those
 * recorded samples.
 */
function career(seed: string): World {
  const w = createWorld({
    country: 'ENG',
    name: 'Set Piece Defence',
    color: '#224466',
    seed,
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
/** A paused sample: its index on the page's timeline and the label of its minute. */
type Shot = { index: number; label: string };
/** A set-piece job the engine recorded: committed, still held, taken at the kick `since`. */
const held = (p: PlayerMotion, since?: number) =>
  !!p.intention &&
  !p.intention.ended &&
  p.intention.priority === 'committed' &&
  (since === undefined || p.intention.since === since);
/** A restart's place, held while the restart is prepared (T359). */
const placed = (p: PlayerMotion | undefined) =>
  !!p?.intention && !p.intention.ended && p.intention.kind === 'restart';

/**
 * The compact recorded scene: the samples, in the page's own order, through the first delivery
 * after which at least six defenders hold set-piece jobs for several samples; a marker and the man
 * he marks who keeps his box spot, a zone guard and the defending keeper throughout. Before it, the
 * walk-in to the delivery's recorded kick (T359): the preparation's samples, where the marker, his
 * man and the guard hold their restart places, the last of them at the kick, standing on them.
 * Set-piece jobs are committed; the open-play box scene's guards (T443, §4.8) are tactical and
 * never held while a set piece's jobs are, so they never count here.
 */
function recordedScene(seed: string) {
  const playback = advanceToNextMatch(career(seed))!;
  const { samples } = presentationSamples(playback.frames);
  // Each sample's recorded match second, in the same order.
  const elapsedOf = playback.frames.flatMap((f) =>
    f.motion?.length ? f.motion.map((m) => m.elapsedSeconds) : [undefined],
  );
  const shot = (index: number): Shot => ({
    index,
    label: playback.frames[samples[index]!.frame]!.label,
  });
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
        // Inside the jobs' window and the minute: a later restart's preparation shows its own
        // places (T359).
        if (jobs.length < 6 || samples[j]!.frame !== samples[k]!.frame || elapsedOf[j]! > until)
          break;
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
      // The jobs start at the kick, recorded as its own sample; the walk-in leads up to it.
      const kick = elapsedOf.indexOf(since);
      const scene = (i: number) => {
        const players = samples[i]!.players!;
        return [
          players[side].find((p) => p.id === marker.id),
          players[att].find((p) => p.id === marker.intention!.opponent),
          players[side].find((p) => p.id === guard.id),
        ];
      };
      if (kick < 0 || !scene(kick).every(placed)) continue;
      // Only a delivered set piece whose stoppage (its rush and still beat, →WEB-32) ends at its
      // kick qualifies; the search moves on past any other.
      const preparation = stoppages(playback).find(
        ({ to }) => Math.abs(to - samples[kick]!.time) <= 0.1,
      );
      if (!preparation) continue;
      // At the kick the walk-in is done: each of them stands on his place.
      for (const p of scene(kick)) {
        expect(p!.position[0]).toBeCloseTo(p!.intention!.target[0], 3);
        expect(p!.position[1]).toBeCloseTo(p!.intention!.target[1], 3);
      }
      let walk = kick;
      while (walk > 0 && scene(walk - 1).every(placed)) walk--;
      // The walk-in lies inside that stoppage: the part of the timeline drawn as its rush and beat.
      for (let i = walk; i <= kick; i++) {
        expect(samples[i]!.time).toBeGreaterThanOrEqual(preparation.from);
        expect(samples[i]!.time).toBeLessThanOrEqual(preparation.to + 0.1);
      }
      const who = (s: 0 | 1, id: string): Who => ({
        side: s,
        index: playback.squads[s].findIndex((p) => p.id === id),
      });
      return {
        playback,
        preparation,
        samples: samples.length,
        walk: [...new Set([walk, kick])].map(shot),
        at: at.map(shot),
        marker: who(side, marker.id),
        runner: who(att, marker.intention!.opponent!),
        guard: who(side, guard.id),
        keeper: who(side, keeper.id),
      };
    }
  return undefined;
}
/**
 * The first of a few seeded careers whose reference match has such a delivery: a football change
 * can leave one match without it (after T370 and T371 the first seed's only one held its jobs
 * through a single sample; on the released model, after T455 and T456, none of the first three
 * had one), and the scene, not the seed, is what this journey checks.
 */
function sceneCareer() {
  const seeds = [
    'set-piece-defence',
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `set-piece-defence-${n}`),
  ];
  for (const seed of seeds) {
    const scene = recordedScene(seed);
    if (scene) return { scene, career: career(seed) };
  }
  throw new Error('no delivery the defenders hold in the reference matches');
}

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
])
  test(`shows both sides through a delivered set piece on ${viewport.name}`, async ({ page }) => {
    // The reference scene is played in Node (V8) and the page's in the browser's own engine: the
    // candidate match reads only the portable math (T358), so every browser records the same match.
    test.slow();
    await page.setViewportSize(viewport);
    const { scene, career } = sceneCareer();
    await importResponsibilityCareer(page, career);
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
    /** Pauses on `shot` and reads each player's state in the inspector. */
    const inspect = async (shot: Shot, states: (readonly [Who, string])[]) => {
      await timeline.fill(String(shot.index));
      await expect(timeline).toHaveValue(String(shot.index));
      await expect(page.getByTestId('match-latest-event').locator('span')).toHaveText(
        `${shot.label}′`,
      );
      for (const [who, label] of states) {
        await chooseOption(inspector, `${who.side}:${who.index}`);
        await expect(state).toHaveText(label);
      }
      await expect(canvas).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    };
    // The walk-in up to the recorded kick (T359): the marker, his man and the guard head for
    // their restart places, not the play before, and stand on them at the kick; the keeper is on
    // his goal.
    for (const shot of scene.walk)
      await inspect(shot, [
        [scene.marker, '포메이션 유지'],
        [scene.runner, '포메이션 유지'],
        [scene.guard, '포메이션 유지'],
        [scene.keeper, '골문 보호'],
      ]);
    // From the delivery's landing to the second ball, the defenders keep their jobs: the marker
    // with his man, who holds his box spot, the zone guarded, the keeper on his goal.
    for (const shot of scene.at)
      await inspect(shot, [
        [scene.marker, '상대 마크'],
        [scene.runner, '빈 공간 침투'],
        [scene.guard, '상대 마크'],
        [scene.keeper, '골문 보호'],
      ]);
    // Played from just before the ball went dead, the walk-in to this kick is drawn as its rush
    // and still beat at 1x with the players still travelling (→WEB-32, MATCH-12).
    expect(scene.preparation, 'the delivery has a stoppage').toBeDefined();
    if (viewport.name === 'phone')
      await expectCompressedPreparation(page, scene.playback, scene.preparation!);
  });
