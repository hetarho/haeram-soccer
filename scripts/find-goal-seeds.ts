/**
 * T813, T839: finds the goal scenes three browser specs watch, by each spec's own criteria before
 * its browser starts, so a change to world generation or the match model re-finds them in minutes
 * rather than in a failed gate. Each scene is a seed `goal-feedback-N` whose career, built with the
 * fixture helpers the specs use (`careerWorld`, `advanceToNextMatch` and `stagedPlayback`, the
 * released scripted model's own match staged as the browser stages it) and read with their goal
 * readers (`goalInstants`, `replayGoals`, the presentation clock), plays the first own match that
 * spec needs. Every scene's goals each have a staged build-up of `GOAL_REPLAY_CONFIG.leadSeconds`
 * (a clip never starts at a period's kick-off or the goal before it), and its goals fall in both
 * halves:
 *
 * - `opening`: `goalWorld` in tests/e2e/goal-replay.spec.ts and tests/e2e/mobile-match-presentation.spec.ts.
 *   The taken-over club's next match opens with a home goal at 5′ or earlier (1 : 0), its cue no
 *   sooner than one clock minute after kick-off, and holds at least three goals, all of them
 *   highlights with their footage retained; the paused seek between the first two goals lands on a
 *   sample before the second, and the second leaves the clip room to return first.
 * - `archived`: tests/e2e/match-core.spec.ts's archived replay of a settled own match, staged from
 *   its script. Three goals or more, the first crossed within the replay's first two clock minutes
 *   at the speed it opens at, the second within one clock minute of the seek sample just before it;
 *   the spec reads the running scores from the reference and seeks past the rest to the end.
 *
 * - `brace`: two goals within one minute, both with their footage, for a journey on separate goals
 *   of one minute (→WEB-94/105); reported when the scan finds one, never a failure when it does not.
 *
 * The scan prints, per scene, the first seed meeting its criteria with its goals (and, for
 * `archived`, the seek sample the spec fills). `--check` reads the seed each spec names (its one
 * `goal-feedback-N`), and for match-core its asserted minutes and seek sample, and exits 1 when a
 * named seed no longer meets them.
 *
 * A seed's match is settled and its record read first (about 3 s a seed, measured 261112 on the
 * scripted model); only a record that can hold a scene is staged (about 15 s). A scan stops once
 * every required scene asked for is found.
 *
 *   pnpm exec tsx scripts/find-goal-seeds.ts [--start 1] [--count 1000] [--scene opening|archived]
 *   pnpm exec tsx scripts/find-goal-seeds.ts --check
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { message as sourceMessage } from '../packages/contracts/src/messages';
import type { MatchFrame, MatchPlayback, MatchRecord } from '../packages/contracts/src/types';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { advanceToNextMatch, stagedPlayback } from '../packages/engine/src/testing';
import {
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
import {
  GOAL_REPLAY_CONFIG,
  replayGoals,
  startGoalReplay,
  type ReplayGoal,
} from '../apps/web/src/features/match-viewer/lib/goalReplay';

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
  /** Goals the match holds at least: the first, and later ones a seek to the end passes. */
  goals: 3,
  /** Clock minutes at the opening speed within which the first goal is crossed. */
  firstMinutes: 2,
  /** Clock minutes from the seek sample within which the second goal is crossed. */
  secondMinutes: 1,
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

/** A seed's career, its next own match settled the way every spec reads it, not yet staged. */
function settled(seed: string) {
  const world = careerWorld({ country: 'ENG', seed });
  world.settings!.responsibilities.sales = 'delegated';
  return advanceToNextMatch(world);
}

/** The staged goals of a playback, with each goal's clip as goal-replay.spec.ts opens it. */
function stagedGoals(playback: MatchPlayback) {
  const { record, frames } = stagedPlayback(playback);
  const { samples, starts } = frameStarts(frames);
  const goals = goalInstants(record, frames, starts);
  const picks = replayGoals(goals, frames, goals.length);
  const clipOf = (pick: ReplayGoal) =>
    startGoalReplay(goals, frames, pick, {
      matchId: record.id,
      clock: { seconds: 0, next: 0 },
      sampleIndex: 0,
      paused: false,
      speed: WATCH_DEFAULT_SPEED,
      finished: false,
    });
  return { record, frames, samples, goals, picks, clipOf, beats: deadBallBeats(frames) };
}

/** What every scene asks of its goals: footage, a full staged build-up and goals in both halves. */
function commonMisses(staged: ReturnType<typeof stagedGoals>) {
  const misses: string[] = [];
  if (!staged.picks.every((pick) => pick.footage)) misses.push('a goal without footage');
  const short = staged.picks.filter((pick) => {
    const clip = staged.clipOf(pick);
    return !clip || pick.goal.seconds - clip.from < GOAL_REPLAY_CONFIG.leadSeconds;
  });
  if (short.length)
    misses.push(
      `build-up under ${GOAL_REPLAY_CONFIG.leadSeconds} s before goal ${short.map((p) => p.goal.id + 1).join(', ')}`,
    );
  return misses;
}

/** The record facts a scene's goals need: both halves, every highlight a goal. */
function recordMisses(record: MatchRecord) {
  const misses: string[] = [];
  if (record.highlights.some((h) => h.action !== GOAL)) misses.push('a highlight is not a goal');
  if (!record.highlights.some((h) => h.minute <= 45)) misses.push('no first-half goal');
  if (!record.highlights.some((h) => h.minute > 45)) misses.push('no second-half goal');
  return misses;
}

/** goal-replay.spec.ts's and mobile-match-presentation.spec.ts's `goalWorld` scene. */
function openingScene(seed: string, playback: MatchPlayback | undefined): Verdict {
  if (!playback) return { seed, misses: ['no own match played'], goals: [] };
  const { record } = playback;
  const misses = recordMisses(record);
  const first = record.highlights[0];
  if (!first || first.side !== 0 || first.action !== GOAL)
    misses.push('first highlight not a home goal');
  if (!first || first.minute > OPENING.latestMinute)
    misses.push(`opening goal after ${OPENING.latestMinute}′`);
  if (record.highlights.length < OPENING.goals)
    misses.push(`fewer than ${OPENING.goals} highlights`);
  // Only a record that can hold the scene is staged.
  if (misses.length) return { seed, misses, goals: listed(record) };
  const staged = stagedGoals(playback);
  const { goals, samples, beats } = staged;
  misses.push(...commonMisses(staged));
  // The 360 run counts a cue per highlight and goal-replay's archive one option per goal.
  if (goals.length !== record.highlights.length) misses.push('goals on the clock ≠ highlights');
  if (goals.length < OPENING.goals) misses.push(`fewer than ${OPENING.goals} goals on the clock`);
  const [one, two] = goals as (GoalInstant | undefined)[];
  if (!one || one.side !== 0 || one.home !== 1 || one.away !== 0) misses.push('not 1 : 0 first');
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

/** match-core.spec.ts's archived replay scene of a settled own match on the released model. */
function archivedScene(seed: string, playback: MatchPlayback | undefined): Verdict {
  if (!playback) return { seed, misses: ['no own match played'], goals: [] };
  const played = playback.record;
  const minutes = played.highlights.map((goal) => goal.minute);
  const misses = recordMisses(played);
  if (played.highlights.length < ARCHIVED.goals) misses.push(`fewer than ${ARCHIVED.goals} goals`);
  if ((played.highlights[0]?.minute ?? 99) > ARCHIVED.firstMinutes + 1)
    misses.push(`first goal after ${ARCHIVED.firstMinutes + 1}′`);
  if (misses.length) return { seed, misses, goals: listed(played), minutes };
  const staged = stagedGoals(playback);
  const { goals, samples, beats } = staged;
  misses.push(...commonMisses(staged));
  if (goals.length !== played.highlights.length) misses.push('goals on the clock ≠ highlights');
  const shown = (time: number) => goals.filter((goal) => goal.seconds <= time).length;
  let seek: number | undefined;
  let firstCue: number | undefined;
  const [one, two] = goals as (GoalInstant | undefined)[];
  if (one && two) {
    // The cue names the first goal's scorer.
    if (!one.scorer || one.scorer !== played.highlights[0]?.player)
      misses.push('first cue unnamed');
    firstCue = presentationMs(0, one.seconds, WATCH_DEFAULT_SPEED, beats);
    if (firstCue > ARCHIVED.firstMinutes * clockMinuteMs)
      misses.push(`first goal after ${ARCHIVED.firstMinutes} clock minutes`);
    // The sample before the second goal's.
    const at = samples.findIndex((sample) => sample.time >= two.seconds);
    seek = at - 1;
    const from = samples[seek]?.time ?? -1;
    if (seek < 0 || shown(from) !== 1) misses.push('no sample between the first two goals');
    else if (
      presentationMs(from, two.seconds, WATCH_DEFAULT_SPEED, beats) >
      ARCHIVED.secondMinutes * clockMinuteMs
    )
      misses.push(`second goal after ${ARCHIVED.secondMinutes} clock minute from sample ${seek}`);
  }
  return { seed, misses, goals: listed(played), firstCue, minutes, seek };
}

/** Two goals within one minute, both with their footage (no spec names it yet). */
function braceScene(seed: string, playback: MatchPlayback | undefined): Verdict {
  if (!playback) return { seed, misses: ['no own match played'], goals: [] };
  const { record } = playback;
  const minutes = record.highlights.filter((h) => h.action === GOAL).map((h) => h.minute);
  const misses = minutes.some((m, i) => i > 0 && m === minutes[i - 1])
    ? []
    : ['no two goals within one minute'];
  if (misses.length) return { seed, misses, goals: listed(record) };
  const staged = stagedGoals(playback);
  if (!staged.picks.every((pick) => pick.footage)) misses.push('a goal without footage');
  if (staged.goals.length !== record.highlights.filter((h) => h.action === GOAL).length)
    misses.push('goals on the clock ≠ goals recorded');
  return { seed, misses, goals: listed(record), minutes };
}

const SCENES = { opening: openingScene, archived: archivedScene, brace: braceScene } as const;
type Scene = keyof typeof SCENES;
/** Scenes reported when found, never a failed scan when not. */
const OPTIONAL: readonly Scene[] = ['brace'];

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
    verdict.minutes && verdict.seek !== undefined
      ? `minutes [${verdict.minutes.join(', ')}], seek sample ${verdict.seek}`
      : '',
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
    const verdict = SCENES[scene](spec.seed, settled(spec.seed));
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
  const required = scenes.filter((scene) => !OPTIONAL.includes(scene));
  const t0 = Date.now();
  let n = start;
  let scanned = 0;
  const done = () => required.every((scene) => found.has(scene)) && found.size === scenes.length;
  for (; n < start + count && !done(); n++) {
    scanned++;
    // One settled match a seed, read by every scene still looked for.
    const seed = `${SEED_PREFIX}${n}`;
    const playback = settled(seed);
    for (const scene of scenes) {
      if (found.has(scene)) continue;
      const verdict = SCENES[scene](seed, playback);
      if (!verdict.misses.length) {
        found.set(scene, verdict);
        console.log(`${scene}: ${describe(verdict)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
    }
    // Optional scenes do not hold the scan open once every required one is found.
    if (required.length && required.every((scene) => found.has(scene))) break;
  }
  for (const scene of scenes)
    if (!found.has(scene)) {
      console.log(`${scene}: none of ${SEED_PREFIX}${start}–${start + scanned - 1} fits`);
      if (!OPTIONAL.includes(scene)) process.exitCode = 1;
    }
  console.log(`${scanned} seeds scanned in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
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
    scene ? [scene] : ['opening', 'archived', 'brace'],
  );
}
