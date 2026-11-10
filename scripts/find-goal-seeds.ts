/**
 * T813: finds the goal scenes three browser specs watch, by each spec's own criteria before its
 * browser starts, so a change to world generation or the match model re-finds them in minutes
 * rather than in a failed gate. Each scene is a seed `goal-feedback-N` whose career, built with the
 * fixture helpers the specs use (`careerWorld`, `advanceToNextMatch`) and read with their goal
 * readers (`goalInstants`, `replayGoals`, the presentation clock), plays the first own match that
 * spec needs:
 *
 * - `opening`: `goalWorld` in tests/e2e/goal-replay.spec.ts and tests/e2e/mobile-match-presentation.spec.ts.
 *   The taken-over club's next match opens with a home goal at 5′ or earlier (1 : 0), its cue no
 *   sooner than one clock minute after kick-off, and holds at least three goals, all of them
 *   highlights with their footage retained; the paused seek between the first two goals lands on a
 *   sample before the second, and the second leaves the clip room to return first.
 * - `archived`: tests/e2e/match-core.spec.ts's archived replay on revision `continuous-aggregate-1`.
 *   Three goals, home then away twice (1 : 0, 1 : 1, 1 : 2): the first crossed within the replay's
 *   first two clock minutes at the speed it opens at, the second within one clock minute of the
 *   sample before its minute's, the third before the seek sample `ARCHIVED.pastSample`.
 *
 * The scan prints, per scene, the first seed meeting its criteria with its goals (and, for
 * `archived`, the seek sample the spec fills). `--check` reads the seed each spec names (its one
 * `goal-feedback-N`), and for match-core its asserted minutes and seek sample, and exits 1 when a
 * named seed no longer meets them.
 *
 * About 0.6 s a scene a seed: measured 261111, goal-feedback-61 and goal-feedback-389 took 389
 * seeds and about four minutes; a scan stops once every scene asked for is found.
 *
 *   pnpm exec tsx scripts/find-goal-seeds.ts [--start 1] [--count 1000] [--scene opening|archived]
 *   pnpm exec tsx scripts/find-goal-seeds.ts --check
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { message as sourceMessage } from '../packages/contracts/src/messages';
import type { MatchFrame, MatchRecord } from '../packages/contracts/src/types';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { advanceToNextMatch } from '../packages/engine/src/testing';
import {
  archivePlayback,
  deadBallBeats,
  presentationMs,
  presentationSamples,
  WATCH_DEFAULT_SPEED,
  WATCH_MINUTE_MS,
} from '../apps/web/src/entities/match/logic';
import {
  goalInstants,
  type GoalInstant,
} from '../apps/web/src/features/match-viewer/lib/goalFeedback';
import { replayGoals } from '../apps/web/src/features/match-viewer/lib/goalReplay';

/** The seeds scanned: `goal-feedback-N`, the family every one of these specs has named. */
const SEED_PREFIX = 'goal-feedback-';

/** The `opening` scene's bounds, as goal-replay.spec.ts and mobile-match-presentation.spec.ts read it. */
const OPENING = {
  /** The latest minute of the opening home goal the specs wait for at the opening speed. */
  latestMinute: 5,
  /**
   * Clock minutes at the opening speed at least before the opening goal's cue: the specs first set
   * up their readers (the scoreboard's entrance, the save status) and then wait for a cue that
   * holds one real second, so a goal in the first seconds could come and go before that wait.
   */
  earliestMinutes: 1,
  /** Goals the match holds at least: the opening one and two later. */
  goals: 3,
  /**
   * The real ms at least between the first goal and the second at 4x, the speed goal-replay sets
   * before its clip: the picker, the speed change and the clip's entry and return take a few
   * seconds on a slow runner, and the second goal's cue must not join the clip's in that count.
   */
  roomMs: 15_000,
  /** The speed goal-replay.spec.ts raises the original to before its clip. */
  clipSpeed: 4,
} as const;

/** The `archived` scene's bounds, as match-core.spec.ts reads it. */
const ARCHIVED = {
  /** The match-model revision its settled match keeps. */
  revision: 'continuous-aggregate-1',
  /** The running scores the spec asserts, goal by goal. */
  scores: [
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  /** Clock minutes at the opening speed within which the first goal is crossed. */
  firstMinutes: 2,
  /** Clock minutes from the seek sample within which the second goal is crossed. */
  secondMinutes: 1,
  /** The sample the spec seeks to past every goal, before seeking back. */
  pastSample: 80,
} as const;

interface Verdict {
  seed: string;
  /** Every criterion it fails, empty when the scene fits. */
  misses: string[];
  /** Its goals as minute and side (`4′ home`). */
  goals: string[];
  /** Real seconds from kick-off to the first goal's cue at the opening speed. */
  firstCue?: number;
  /** The `archived` scene's minutes and seek sample, as match-core.spec.ts asserts them. */
  minutes?: number[];
  seek?: number;
}

const GOAL = sourceMessage('copy.summary.68a6cf8ed8');
/** One minute of the clock in real ms at the speed a live and an archived match open at. */
const clockMinuteMs = WATCH_MINUTE_MS / WATCH_DEFAULT_SPEED;
const side = (s: 0 | 1) => (s === 0 ? 'home' : 'away');
const listed = (record: MatchRecord) =>
  record.highlights.map((h) => `${h.minute}′ ${h.action === GOAL ? side(h.side) : h.action}`);

/** Where each frame starts on the presentation clock, as Pitch.tsx and the specs read it. */
function frameStarts(frames: MatchFrame[]) {
  const { samples } = presentationSamples(frames);
  const starts: number[] = [];
  for (const sample of samples) starts[sample.frame] ??= sample.time;
  return { samples, starts };
}

/** goal-replay.spec.ts's and mobile-match-presentation.spec.ts's `goalWorld` scene. */
function openingScene(seed: string): Verdict {
  const world = careerWorld({ country: 'ENG', seed });
  world.settings!.responsibilities.sales = 'delegated';
  const playback = advanceToNextMatch(world);
  if (!playback) return { seed, misses: ['no own match played'], goals: [] };
  const { record, frames } = playback;
  const { samples, starts } = frameStarts(frames);
  const goals = goalInstants(record, frames, starts);
  const picks = replayGoals(goals, frames, goals.length);
  const misses: string[] = [];
  const first = record.highlights[0];
  if (!first || first.side !== 0 || first.action !== GOAL)
    misses.push('first highlight not a home goal');
  if (!first || first.minute > OPENING.latestMinute)
    misses.push(`opening goal after ${OPENING.latestMinute}′`);
  if (record.highlights.length < OPENING.goals)
    misses.push(`fewer than ${OPENING.goals} highlights`);
  // The 360 run counts a cue per highlight and goal-replay's archive one option per goal.
  if (record.highlights.some((h) => h.action !== GOAL)) misses.push('a highlight is not a goal');
  if (goals.length !== record.highlights.length) misses.push('goals on the clock ≠ highlights');
  if (goals.length < OPENING.goals) misses.push(`fewer than ${OPENING.goals} goals on the clock`);
  const [one, two] = goals as (GoalInstant | undefined)[];
  if (!one || one.side !== 0 || one.home !== 1 || one.away !== 0) misses.push('not 1 : 0 first');
  if (!picks.every((pick) => pick.footage)) misses.push('a goal without footage');
  const beats = deadBallBeats(frames);
  const firstCue = one && presentationMs(0, one.seconds, WATCH_DEFAULT_SPEED, beats);
  if (firstCue !== undefined && firstCue < OPENING.earliestMinutes * clockMinuteMs)
    misses.push(`opening goal within ${OPENING.earliestMinutes} clock minute of kick-off`);
  if (one && two) {
    // The paused seek in 경기 상세: the first sample past the first goal comes before the second.
    const instant = samples.findIndex((sample) => sample.time > one.seconds);
    if (instant < 0 || samples[instant]!.time >= two.seconds)
      misses.push('no sample between the first two goals');
    const room = presentationMs(one.seconds, two.seconds, OPENING.clipSpeed, beats);
    if (room < OPENING.roomMs)
      misses.push(`second goal ${Math.round(room)} ms after the first at ${OPENING.clipSpeed}x`);
  }
  return { seed, misses, goals: listed(record), firstCue };
}

/** match-core.spec.ts's archived replay scene on a settled revision-1 match. */
function archivedScene(seed: string): Verdict {
  const world = careerWorld(
    { country: 'ENG', seed },
    { revision: ARCHIVED.revision, enabled: true },
  );
  world.settings!.responsibilities.sales = 'delegated';
  const played = advanceToNextMatch(world)?.record;
  if (!played) return { seed, misses: ['no own match played'], goals: [] };
  const misses: string[] = [];
  const minutes = played.highlights.map((goal) => goal.minute);
  if (played.highlights.some((h) => h.action !== GOAL)) misses.push('a highlight is not a goal');
  const { frames } = archivePlayback(played);
  const { samples, starts } = frameStarts(frames);
  const beats = deadBallBeats(frames);
  const goals = goalInstants(played, frames, starts);
  const scores = goals.map((goal) => [goal.home, goal.away]);
  if (JSON.stringify(scores) !== JSON.stringify(ARCHIVED.scores))
    misses.push(`scores ${scores.map((s) => s.join(':')).join(', ') || 'none'}`);
  const shown = (time: number) => goals.filter((goal) => goal.seconds <= time).length;
  let seek: number | undefined;
  let firstCue: number | undefined;
  const [one, two, three] = goals as (GoalInstant | undefined)[];
  if (one && two && three) {
    // The cue names the first goal's scorer.
    if (!one.scorer || one.scorer !== played.highlights[0]?.player)
      misses.push('first cue unnamed');
    firstCue = presentationMs(0, one.seconds, WATCH_DEFAULT_SPEED, beats);
    if (firstCue > ARCHIVED.firstMinutes * clockMinuteMs)
      misses.push(`first goal after ${ARCHIVED.firstMinutes} clock minutes`);
    // One sample a minute: the one before the second goal's minute's.
    const at = samples.findIndex((sample) => sample.time >= two.seconds);
    seek = at - 1;
    const from = samples[seek]?.time ?? -1;
    if (seek < 0 || shown(from) !== 1) misses.push('no sample between the first two goals');
    else if (
      presentationMs(from, two.seconds, WATCH_DEFAULT_SPEED, beats) >
      ARCHIVED.secondMinutes * clockMinuteMs
    )
      misses.push(`second goal after ${ARCHIVED.secondMinutes} clock minute from sample ${seek}`);
    const past = samples[ARCHIVED.pastSample];
    if (!past || shown(past.time) !== goals.length)
      misses.push(`a goal past sample ${ARCHIVED.pastSample}`);
  }
  return { seed, misses, goals: listed(played), firstCue, minutes, seek };
}

const SCENES = { opening: openingScene, archived: archivedScene } as const;
type Scene = keyof typeof SCENES;

/** The specs naming each scene's seed, read by `--check`. */
const SPECS: { file: string; scene: Scene }[] = [
  { file: 'tests/e2e/goal-replay.spec.ts', scene: 'opening' },
  { file: 'tests/e2e/mobile-match-presentation.spec.ts', scene: 'opening' },
  { file: 'tests/e2e/match-core.spec.ts', scene: 'archived' },
];

const describe = (verdict: Verdict) =>
  [
    verdict.seed,
    verdict.goals.join(', ') || 'no goals',
    verdict.firstCue === undefined
      ? ''
      : `first cue ${(verdict.firstCue / 1000).toFixed(1)} s after kick-off at ${WATCH_DEFAULT_SPEED}x`,
    verdict.minutes ? `minutes [${verdict.minutes.join(', ')}], seek sample ${verdict.seek}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** The one seed a spec names, and for match-core the minutes and seek sample it asserts. */
function named(file: string) {
  const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  // Comments name earlier seeds too; the code names one in a `seed:` property.
  const code = [...text.matchAll(new RegExp(`seed: '(${SEED_PREFIX}\\d+)'`, 'g'))].map(
    (m) => m[1]!,
  );
  const distinct = [...new Set(code)];
  const minutes = text.match(/goal\.minute\)\)\.toEqual\(\[([\d,\s]+)\]\)/)?.[1];
  const seek = text.match(/Going back before[\s\S]*?scrubber\.fill\('(\d+)'\)/)?.[1];
  return {
    seed: distinct.length === 1 ? distinct[0] : undefined,
    minutes: minutes?.split(',').map((m) => Number(m.trim())),
    seek: seek === undefined ? undefined : Number(seek),
  };
}

function check() {
  let failed = false;
  for (const { file, scene } of SPECS) {
    const spec = named(file);
    if (!spec.seed) {
      console.log(`✗ ${file}: no single \`seed: '${SEED_PREFIX}N'\` found`);
      failed = true;
      continue;
    }
    const verdict = SCENES[scene](spec.seed);
    const misses = [...verdict.misses];
    if (scene === 'archived') {
      if (JSON.stringify(spec.minutes) !== JSON.stringify(verdict.minutes))
        misses.push(`spec asserts minutes [${spec.minutes?.join(', ')}]`);
      if (spec.seek !== verdict.seek) misses.push(`spec seeks to sample ${spec.seek}`);
    }
    failed ||= misses.length > 0;
    console.log(
      `${misses.length ? '✗' : '✓'} ${file} (${scene}): ${describe(verdict)}` +
        (misses.length ? `\n    ${misses.join('\n    ')}` : ''),
    );
  }
  if (failed) {
    console.log('\nRe-find the scenes: pnpm exec tsx scripts/find-goal-seeds.ts');
    process.exitCode = 1;
  }
}

function scan(start: number, count: number, scenes: Scene[]) {
  const found = new Map<Scene, Verdict>();
  const t0 = Date.now();
  let n = start;
  for (; n < start + count && found.size < scenes.length; n++)
    for (const scene of scenes) {
      if (found.has(scene)) continue;
      const verdict = SCENES[scene](`${SEED_PREFIX}${n}`);
      if (!verdict.misses.length) {
        found.set(scene, verdict);
        console.log(`${scene}: ${describe(verdict)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
    }
  for (const scene of scenes)
    if (!found.has(scene)) {
      console.log(`${scene}: none of ${SEED_PREFIX}${start}–${start + count - 1} fits`);
      process.exitCode = 1;
    }
  console.log(`${n - start} seeds scanned in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--check')) check();
else {
  const scene = opt('scene') as Scene | undefined;
  if (scene && !(scene in SCENES)) throw new Error(`--scene is one of ${Object.keys(SCENES)}`);
  scan(
    Number(opt('start') ?? 1),
    Number(opt('count') ?? 1000),
    scene ? [scene] : ['opening', 'archived'],
  );
}
