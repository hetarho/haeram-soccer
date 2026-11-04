import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { PixelIcon } from './PixelIcon';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type {
  MatchEvent,
  MatchPlayback,
  MatchFrame,
  PlayerMotion,
  PlayerMotionState,
  World,
} from '../../../../packages/contracts/src/types';
import {
  MATCH_MOTION_CONFIG,
  matchdayRole,
  playerTendencies,
} from '../../../../packages/engine/src/match';
import { clubManager } from '../../../../packages/engine/src/managerMarket';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { percent } from './format';
// The report only shows once a match is over: it loads then, keeping it out of the entry (→ARCH-28).
const MatchReport = lazy(() =>
  import('./MatchReport').then((module) => ({ default: module.MatchReport })),
);
import { MatchMoments } from './MatchMoments';
import { MatchCharts } from './MatchCharts';
import { CrestMark } from './ClubCrest';
import { inkOn } from './crests';
import { figureActionWindows } from './figureActions';
import { createFigurePainter, figurePoint, playerLook, type PlayerLook } from './figurePainting';
import { gaitDistances, poseAt, type FigurePose } from './figurePose';
import { reducedMotion } from './motion';
import { drawNumberTag, numberTagStyle, placeNumberTags } from './numberTags';
import { figureInputs } from './pitchFigures';
import {
  ballRadius,
  createGroundPainter,
  markerRadius,
  paintPitchBall,
  PITCH_PAD,
  type PitchSkin,
} from './pitchPainting';
import { usePitchSkin } from './usePitchSkin';
import { keepersBySample, matchLook, UNRECORDED_KIT } from './matchAppearance';
import { scoreboardHalves } from './scoreboardHalves';
import { incidentFrame, sampleAt, sentOff } from './moments';
import {
  advanceGoalFeedback,
  GOAL_FEEDBACK_CONFIG,
  goalInstants,
  goalsShown,
  seekGoalFeedback,
  type GoalFeedbackState,
} from './goalFeedback';
import {
  GOAL_REPLAY_CONFIG,
  goalsSeen,
  replayClock,
  replayEnded,
  replayEntryOpen,
  replayFor,
  replayGoals,
  replayGoalsReached,
  startGoalReplay,
  type GoalReplay,
  type ReplayGoal,
} from './goalReplay';
import { Dialog } from './Dialog';
import { useLocale } from '../presentation/react';
import { possessionKey, resolvePossessionCue, type PossessionCue } from './possessionCue';
import {
  beatAt,
  beatCaptions,
  deadBallBeats,
  frameElapsedMs,
  locate,
  presentationSamples,
  runningLength,
  type Preparation,
  WATCH_DEFAULT_SPEED,
  WATCH_SPEEDS,
} from './presentationClock';
import s from './App.module.css';
import t from './Pitch.module.css';

const stateLabels: Record<PlayerMotionState, string> = {
  shape: sourceMessage('copy.Pitch.c8b026ca9e'),
  support: sourceMessage('copy.Pitch.d0fdc8c1b3'),
  run: sourceMessage('copy.Pitch.b66ab772e3'),
  press: sourceMessage('copy.Pitch.75e147f54f'),
  mark: sourceMessage('copy.Pitch.dd4d63cca3'),
  recover: sourceMessage('copy.Pitch.4cdbdae8b5'),
  carry: sourceMessage('copy.Pitch.0c24193053'),
  keeper: sourceMessage('copy.Pitch.abcf2c81c5'),
};
/** Intentions the inspector names by their own label rather than their motion state's (→MATCH-32). */
const intentionLabels: Partial<Record<NonNullable<PlayerMotion['intention']>['kind'], string>> = {
  screen: sourceMessage('copy.Pitch.2e1032e0a1'),
};
/** What the inspector says a player is doing: an intention he still holds that has a label, else his motion state. */
const motionLabel = ({ state, intention }: PlayerMotion) =>
  (intention && !intention.ended && intentionLabels[intention.kind]) || stateLabels[state];
/** Height (pitch units) at which a lofted ball reaches its largest drawn size. */
const BALL_PEAK = MATCH_MOTION_CONFIG.ball.maxLoft;
/** A still figure facing up the screen, drawn off-screen only to build the worn kits' torso sprites. */
const WARM_POSE: FigurePose = poseAt(
  {
    id: '',
    keeper: false,
    time: 0,
    position: [50, 50],
    speed: 0,
    velocity: [0, 0],
    velocityBefore: [0, 0],
    toBall: [0, -1],
    ballHeight: 0,
    carrier: false,
    distance: 0,
  },
  undefined,
  { reducedMotion: true },
);
const NO_KEEPERS: readonly [undefined, undefined] = [undefined, undefined];
/**
 * The recorded carrier's cue (WEB-95): a ring on the grass under him and a coloured number plate.
 * His figure and plate keep everyone's size.
 */
const CARRIER_MARK = { ringScale: 1.45, ringGap: 3 } as const;
/** How far the ball's panels turn per pitch unit it travels, radians. */
const BALL_SPIN_PER_UNIT = 0.35;

/**
 * How the ball is drawn `height` above the pitch (ball track units) on a pitch `width` px wide and
 * `fh` px deep: a lofted ball rises over its shadow, looks closer and its shadow fades.
 */
function ballLook(height: number, width: number, fh: number, spin: number) {
  const air = Math.min(1, Math.max(0, height) / BALL_PEAK);
  const size = ballRadius(width);
  return {
    air,
    radius: size * (1 + air * 0.35),
    shadow: size * (1 - air * 0.3),
    lift: (Math.max(0, height) * fh) / 100,
    spin,
  };
}

/** The ball over its point (x, y) on the grass, CSS px: the shadow stays on the ground. */
function paintBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ball: ReturnType<typeof ballLook>,
  skin: PitchSkin,
) {
  ctx.fillStyle = `rgba(0, 0, 0, ${0.4 - ball.air * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 2, ball.shadow, ball.shadow * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  paintPitchBall(ctx, x, y - ball.lift, ball.radius, skin, ball.spin);
}

/** The ground distance the ball has travelled by each track point, pitch units. */
function trackTravel(track: readonly (readonly [number, number, number])[]): number[] {
  const travel: number[] = [];
  let sum = 0;
  track.forEach((point, i) => {
    const before = track[i - 1];
    if (before) sum += Math.hypot(point[0] - before[0], point[1] - before[1]);
    travel.push(sum);
  });
  return travel;
}

/**
 * What a broadcast commentator calls (→MATCH-24): the opening kick-off and the whistles, every
 * shot, corners and penalties, offsides, cards, injuries and substitutions. The build-up between
 * them — passes, carries, take-ons, clearances, throw-ins — goes unsaid.
 */
export function notableEvent(event: MatchEvent, frame: number) {
  switch (event.kind) {
    case 'shot':
    case 'card':
    case 'sub':
    case 'injury':
    case 'offside':
    case 'whistle':
      return true;
    case 'restart':
      return event.restart === 'corner' || event.restart === 'penalty';
    case 'kickoff':
      return frame === 0;
    default:
      return false;
  }
}
/**
 * The notable events the presentation has reached, newest first, each with its minute's label;
 * `limit` stops early, so the current line reads only its latest.
 */
export function commentaryLog(
  frames: MatchFrame[],
  index: number,
  within: number,
  limit = Infinity,
) {
  const log: { key: string; label: string; text: string }[] = [];
  for (let i = Math.min(index, frames.length - 1); i >= 0 && log.length < limit; i--) {
    const events = frames[i]!.events ?? [];
    for (let j = events.length - 1; j >= 0 && log.length < limit; j--) {
      const event = events[j]!;
      if (event.text && notableEvent(event, i) && (i < index || event.t <= within * 60))
        log.push({ key: `${i}:${j}`, label: frames[i]!.label, text: event.text });
    }
  }
  return log;
}

export interface PitchControls {
  finished: boolean;
  /** Jump to the final whistle and pause. */
  reveal: () => void;
}

export function Pitch({
  playback: p,
  world,
  summary = false,
  onFinish,
  onPlaybackStart,
  onPresentationChange,
  actions,
  lead,
}: {
  playback?: MatchPlayback;
  world: World;
  summary?: boolean;
  onFinish?: (id: string) => void;
  onPlaybackStart?: (id: string) => void;
  onPresentationChange?: (state: { matchId?: string; finished: boolean; details: boolean }) => void;
  /** The primary actions under the charts; without them the pitch offers its own result button. */
  actions?: (controls: PitchControls) => ReactNode;
  /** Back navigation in the scoreboard row. */
  lead?: ReactNode;
}) {
  useTextLocale();
  const detailsId = useId();
  const { t: tr } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  const skin = usePitchSkin(canvas);
  const [ground] = useState(() => createGroundPainter());
  /**
   * The presented instant in running match seconds (→WEB-32), with the recorded goal it holds at
   * (→WEB-94).
   */
  const clock = useRef<GoalFeedbackState>({ seconds: 0, next: 0 });
  const last = useRef(0);
  const lastUi = useRef(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [sampleMatchId, setSampleMatchId] = useState(p?.record.id);
  // The held goal's cue and the goals shown so far, mirrored from the clock for rendering.
  const [cue, setCue] = useState<number>();
  // The still beat under way (→WEB-32), for its caption.
  const [beat, setBeat] = useState<Preparation>();
  const [shownGoals, setShownGoals] = useState(0);
  // Who has the ball at the presented instant, shared by the scoreboard and the pitch (→WEB-95).
  const [possession, setPossession] = useState<PossessionCue>({ state: 'unknown' });
  const possessionShown = useRef('');
  // The side whose colour fills the scoreboard: the last side seen on the ball, kept through a
  // loose ball so the colour changes only when the other side wins it.
  const [ballSide, setBallSide] = useState<0 | 1>();
  const [speed, setSpeed] = useState<number>(WATCH_DEFAULT_SPEED);
  const [paused, setPaused] = useState(false);
  // The player sheet and the details sheet each hold the match still while open.
  const [inspect, setInspect] = useState(false);
  const [details, setDetails] = useState(false);
  const [commentary, setCommentary] = useState(false);
  const resume = useRef<boolean | undefined>(undefined);
  // Where the last painted frame put each player, for a tap on the pitch to find him.
  const placed = useRef<{ id: string; side: 0 | 1; x: number; y: number }[]>([]);
  const placedRadius = useRef(0);
  const [reviewedId, setReviewedId] = useState<string>();
  const [selection, setSelection] = useState('0:8');
  // A goal-scene clip under way (→WEB-105): its own presentation over a snapshot of the original
  // viewing. The ref is what the frame loop reads, so a return takes effect on the next frame.
  const [replayState, setReplay] = useState<GoalReplay>();
  const replaying = useRef<GoalReplay | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  // The goals a live presentation has shown through their cue, kept when a seek goes back.
  const [seen, setSeen] = useState(0);
  const seenShown = useRef(0);
  const replayReturn = useRef<HTMLButtonElement>(null);
  const replayOpen = useRef<HTMLButtonElement>(null);
  const refocusReplay = useRef(false);
  // Every sample and recorded ball position at its match time, so a pass flies at its real speed.
  const timed = useMemo(() => presentationSamples(p?.frames ?? []), [p]);
  const { samples, track } = timed;
  // How far the ball has rolled by each track point, so its panels turn with its travel.
  const travel = useMemo(() => trackTravel(track), [track]);
  const length = runningLength(p?.frames.length ?? 0);
  // Every stoppage's rush and still beat, drawn at their own rates (→WEB-32).
  const preparations = useMemo(() => deadBallBeats(p?.frames ?? []), [p]);
  const goals = useMemo(() => {
    if (!p) return [];
    const starts: number[] = [];
    for (const sample of samples) starts[sample.frame] ??= sample.time;
    return goalInstants(p.record, p.frames, starts);
  }, [p, samples]);
  // Each player's place in his matchday roster (starters, then the bench) numbers his figure.
  const numbers = useMemo(
    () => new Map(p?.squads.flatMap((squad) => squad.map((player, i) => [player.id, i] as const))),
    [p],
  );
  // What the figures are posed from besides the presented instant (→MATCH-37): every recorded
  // action's window and every player's metres travelled, built once per playback.
  const windows = useMemo(() => figureActionWindows(p?.frames ?? []), [p]);
  const distances = useMemo(() => gaitDistances(samples), [samples]);
  // Each player's own skin and hair (→MATCH-36), the same in every match.
  const looks = useMemo(
    () =>
      new Map<string, PlayerLook>(
        p?.squads.flatMap((squad) => squad.map((player) => [player.id, playerLook(player.id)])),
      ),
    [p],
  );
  const names = useMemo(
    () => new Map(p?.squads.flatMap((squad) => squad.map((player) => [player.id, player.name]))),
    [p],
  );
  const captions = beatCaptions(beat, (id) => names.get(id) ?? '');
  // What both sides wore, from the record's own snapshot only (KIT-12): resolved once per record,
  // so editing a club's design while watching never repaints this match.
  const look = useMemo(() => (p ? matchLook(p.record) : undefined), [p]);
  // The scoreboard's halves in the shirts the sides wore (→WEB-50).
  const halves = useMemo(() => (look ? scoreboardHalves(look) : undefined), [look]);
  // Who is in goal in each sample, found by player over the whole matchday roster.
  const keepers = useMemo(() => keepersBySample(samples, p?.squads ?? [[], []]), [samples, p]);
  // One painter, and so one torso-sprite cache, per mounted pitch: rAF only blits cached shirts.
  const [painter] = useState(() => createFigurePainter());
  const [selectedSide, selectedIndex] = selection.split(':').map(Number);
  const visibleIndex = sampleMatchId === p?.record.id ? sampleIndex : 0;
  const sample = samples[Math.min(visibleIndex, samples.length - 1)];
  const frame: MatchFrame | undefined = p?.frames[sample?.frame ?? 0];
  const onRecord = sampleMatchId === p?.record.id;
  const replay = replayFor(replayState, p?.record.id);
  // The final recorded goal finishes its cue before the match does. A clip keeps the original
  // viewing's state, so it never finishes, restarts or marks the match watched (→WEB-105).
  const finished = replay
    ? replay.origin.finished
    : !!p &&
      onRecord &&
      sampleIndex >= samples.length - 1 &&
      cue === undefined &&
      shownGoals >= goals.length;
  // An archive offers every recorded goal; a live presentation those it has shown.
  const offered = useMemo(
    () => (p ? replayGoals(goals, p.frames, summary ? goals.length : seen) : []),
    [p, goals, summary, seen],
  );
  // While the original viewing holds a goal, its shortcut and the picker's goals keep their place
  // and focus but are unavailable until the hold ends (→WEB-94/105).
  const replayHeld = !replay && cue !== undefined;
  const noteSeen = useCallback((state: GoalFeedbackState) => {
    const reached = goalsSeen(state);
    if (reached <= seenShown.current) return;
    seenShown.current = reached;
    setSeen(reached);
  }, []);
  // Back to the original viewing as it was on entry: its instant, play state and speed, without
  // another cue for a goal it already celebrated (→WEB-105).
  const endReplay = useCallback(() => {
    const clip = replaying.current;
    if (!clip) return;
    replaying.current = undefined;
    const { clock: back, sampleIndex: index, paused: wasPaused, speed: wasSpeed } = clip.origin;
    clock.current = back;
    // A fresh elapsed-time reading, so the return never catches up the clip's time.
    last.current = 0;
    lastUi.current = 0;
    refocusReplay.current = document.activeElement === replayReturn.current;
    setReplay(undefined);
    setCue(undefined);
    setShownGoals(goalsShown(back));
    setSampleIndex(index);
    setSpeed(wasSpeed);
    setPaused(wasPaused);
  }, []);
  const heldGoal = onRecord && cue !== undefined ? goals[cue] : undefined;
  const presentedScore = onRecord ? goals[shownGoals - 1] : undefined;
  const home = world.clubs.find((c) => c.id === p?.record.home);
  const away = world.clubs.find((c) => c.id === p?.record.away);
  const selectedPlayer = p?.squads[selectedSide]?.[selectedIndex];
  const selectedId = selectedPlayer?.id;
  const selectedMotion = sample?.players?.[selectedSide]?.find((m) => m.id === selectedId);
  const reds = p ? sentOff(p.record, p.frames, sample?.frame ?? 0) : [0, 0];
  // Why a player has left the pitch so far: sent off, substituted or injured.
  const gone = new Map(
    (p?.record.incidents ?? []).flatMap((incident) =>
      incident.kind === 'yellow' || incidentFrame(p!.frames, incident) > (sample?.frame ?? 0)
        ? []
        : [
            [
              incident.player,
              incident.kind === 'sub'
                ? sourceMessage('copy.LabPage.084c5a6dd7')
                : incident.kind === 'injury'
                  ? sourceMessage('copy.Pitch.0e9e3ce22b')
                  : sourceMessage('copy.LabPage.68e69c7b9c'),
            ] as const,
          ],
    ),
  );
  // The inspected player's tendencies (→PLAYER-26): 자유도 is what his club's manager gives him
  // in his role (→STAFF-46), ours or the named manager of a club nobody owns.
  const selectedClub = selectedSide === 0 ? home : away;
  const traits =
    p && selectedPlayer && selectedClub
      ? playerTendencies(
          selectedPlayer,
          selectedClub.id === world.playerClub ? world.manager : clubManager(world, selectedClub),
          matchdayRole(
            p.record,
            p.squads[selectedSide as 0 | 1],
            selectedSide as 0 | 1,
            selectedIndex,
          ),
        )
      : undefined;
  const latestGoal = p?.record.highlights
    .filter((event) => event.minute <= (frame?.minute ?? 0))
    .at(-1);
  // The latest call worth making, narrated by the engine (→MATCH-24), with its own minute.
  const call = p
    ? commentaryLog(p.frames, sample?.frame ?? 0, sample?.within ?? 1, 1)[0]
    : undefined;
  const lastLabel = p?.frames.at(-1)?.label ?? '90';

  useLayoutEffect(() => {
    onPresentationChange?.({ matchId: p?.record.id, finished, details });
  }, [p?.record.id, finished, details, onPresentationChange]);

  useEffect(() => {
    if (finished && p) setReviewedId(p.record.id);
    if (finished && p && samples.length) onFinish?.(p.record.id);
  }, [finished, p?.record.id, samples.length, onFinish]);

  useLayoutEffect(() => {
    clock.current = { seconds: 0, next: 0 };
    lastUi.current = 0;
    setSampleIndex(0);
    setCue(undefined);
    setShownGoals(0);
    possessionShown.current = '';
    setPossession({ state: 'unknown' });
    setBallSide(undefined);
    resume.current = undefined;
    setCommentary(false);
    // A new playback discards any clip of the one before it.
    replaying.current = undefined;
    setReplay(undefined);
    setPicking(false);
    seenShown.current = 0;
    setSeen(0);
    setSampleMatchId(p?.record.id);
    setSelection('0:8');
    setDetails(false);
    setInspect(false);
    // Every presentation opens at the default speed, live or archived (→WEB-32).
    setSpeed(WATCH_DEFAULT_SPEED);
    setPaused(
      document.hidden || (summary && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    );
    if (p) onPlaybackStart?.(p.record.id);
  }, [p?.record.id, onPlaybackStart, summary]);

  useEffect(() => {
    const hide = () => {
      if (!summary || document.hidden) setPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [summary]);

  useEffect(() => {
    // Build the four torso sprites (both outfield kits, both keepers) for the size the pitch is
    // drawn at before the frame loop needs them, and again when that size changes, so the loop
    // below only blits cached sprites (ARCH-7).
    const element = canvas.current;
    const scratch = element && look ? document.createElement('canvas').getContext('2d') : null;
    if (!element || !look || !scratch) return;
    const warm = () => {
      const width = element.clientWidth;
      if (!width) return;
      const dpr = skin.pixelSize ? 1 / skin.pixelSize : Math.min(2, window.devicePixelRatio || 1);
      const radius = markerRadius(width);
      for (const side of look.sides)
        for (const kit of [side.kit, side.keeperKit])
          painter.draw(scratch, WARM_POSE, kit, {
            x: radius * 3,
            y: radius * 3,
            radius,
            dpr,
            look: playerLook(''),
            outline: skin.markerOutline,
            outlineWidth: 0,
          });
    };
    warm();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(warm);
    observer.observe(element);
    return () => observer.disconnect();
  }, [look, painter, skin]);

  useEffect(() => {
    let raf = 0;
    last.current = 0;
    const pitchFont = canvas.current
      ? getComputedStyle(canvas.current).fontFamily
      : 'Galmuri11, sans-serif';
    const carrierMark = skin.carrier;
    const tagStyle = numberTagStyle(skin, pitchFont);
    const carrierTagStyle = { ...tagStyle, plate: carrierMark, ink: inkOn(carrierMark) };
    const draw = (time: number) => {
      const elapsed = frameElapsedMs(time, last.current);
      last.current = time;
      const end = Math.max(0, samples.length - 1);
      if (p) {
        // A clip reaches no goal after its own and returns once that goal's hold ends (→WEB-105).
        const clip = replaying.current;
        clock.current = advanceGoalFeedback(
          clock.current,
          clip ? replayGoalsReached(goals, clip) : goals,
          {
            elapsedMs: elapsed,
            speed,
            length,
            running: !paused && !document.hidden,
            preparations,
          },
        );
        if (clip && replayEnded(clock.current, clip)) endReplay();
        else if (!clip) noteSeen(clock.current);
        // Only a new cue or goal re-renders; a held goal keeps one cue however often this runs.
        setCue(clock.current.cue?.goal);
        setBeat(beatAt(preparations, clock.current.seconds));
        setShownGoals(goalsShown(clock.current));
      }
      const now = clock.current.seconds;
      const position = Math.min(end, locate(timed.times, now, timed.sampleBreak));
      const index = Math.min(end, Math.floor(position + 1e-6));
      const shown = samples[index];
      // The minute being played: the shown sample's, or the next one before its first sample.
      const minute =
        shown && now - shown.frame * 60 > 60
          ? Math.min((p?.frames.length ?? 1) - 1, Math.floor(now / 60))
          : (shown?.frame ?? 0);
      const ownership: PossessionCue = p
        ? resolvePossessionCue(shown, p.frames[minute], now - minute * 60)
        : { state: 'unknown' };
      const ownershipKey = possessionKey(ownership);
      if (ownershipKey !== possessionShown.current) {
        possessionShown.current = ownershipKey;
        setPossession(ownership);
        if (ownership.side !== undefined) setBallSide(ownership.side);
      }
      const element = canvas.current;
      // The presented running second on the canvas, read by journeys that time the clock (→WEB-32).
      const presented = now.toFixed(2);
      if (element && element.dataset.seconds !== presented) element.dataset.seconds = presented;
      // Keep replay time, but leave hidden/inert views out of layout and painting work. The final
      // whistle still lands, so home knows an unwatched match has ended.
      if (element?.closest('[hidden], [inert]')) {
        if (index === end && lastUi.current !== -1) {
          lastUi.current = -1;
          setSampleIndex(end);
        }
        raf = requestAnimationFrame(draw);
        return;
      }
      if (time - lastUi.current > 120 || index === end) {
        setSampleIndex(index);
        lastUi.current = time;
      }
      const current = samples[index];
      const next = samples[Math.min(end, index + 1)] || current;
      const mix = Math.max(0, position - index);
      const ctx = element?.getContext('2d');
      if (element && ctx) {
        const width = element.clientWidth;
        const height = element.clientHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (
          element.width !== Math.round(width * dpr) ||
          element.height !== Math.round(height * dpr)
        ) {
          element.width = Math.round(width * dpr);
          element.height = Math.round(height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ground.draw(ctx, width, height, dpr, skin);
        ctx.imageSmoothingEnabled = !skin.pixelSize;
        const pad = width * PITCH_PAD;
        const fw = width - pad * 2;
        const fh = height - pad * 2;
        const x = (v: number) => pad + (fw * v) / 100;
        const y = (v: number) => pad + (fh * v) / 100;
        if (p && current && look) {
          const radius = markerRadius(width);
          let bx = current.ball[0] * (1 - mix) + next.ball[0] * mix;
          let by = current.ball[1] * (1 - mix) + next.ball[1] * mix;
          let bh = 0;
          let rolled = 0;
          if (track.length) {
            const g = locate(timed.trackTimes, now, timed.trackBreak);
            const a = track[Math.floor(g)]!,
              b = track[Math.ceil(g)]!,
              f = g - Math.floor(g);
            bx = a[0] * (1 - f) + b[0] * f;
            by = a[1] * (1 - f) + b[1] * f;
            bh = a[2] * (1 - f) + b[2] * f;
            rolled = travel[Math.floor(g)]! * (1 - f) + travel[Math.ceil(g)]! * f;
          }
          const still = reducedMotion();
          // Every player on the pitch in this sample, posed from what the record says at this
          // instant (→MATCH-37); an archived match without motion stands its sides in a fixed
          // shape.
          const figures = figureInputs(current, next, mix, {
            time: now,
            index,
            timeline: timed,
            distances,
            mapping: { pad, fw, fh },
            ball: [bx, by],
            ballHeight: bh,
            carrierId: ownership.carrierId,
            keepers: keepers[index] ?? NO_KEEPERS,
            numbers,
          });
          placed.current = figures.map(({ input, side, x: fx, y: fy }) => ({
            id: input.id,
            side,
            x: fx,
            y: fy,
          }));
          placedRadius.current = radius;
          const poseOptions = {
            reducedMotion: still,
            unit: [fw / 100, fh / 100] as const,
          };
          const poses = figures.map(({ input }) =>
            poseAt(input, windows.get(input.id), poseOptions),
          );
          const carrierIndex = figures.findIndex(({ input }) => input.carrier);
          const carrier = figures[carrierIndex];
          // The ball goes with the figure holding it most firmly, eased from its track into his
          // socket (→MATCH-37); that figure is drawn last, so no other body covers it.
          let holder = -1;
          poses.forEach((pose, i) => {
            if (pose.ball && pose.ball.hold > (poses[holder]?.ball?.hold ?? 0)) holder = i;
          });
          let ballX = x(bx),
            ballY = y(by),
            ballHeight = bh;
          const held = poses[holder]?.ball;
          if (held) {
            const { x: fx, y: fy } = figures[holder]!;
            const [sx, sy] = figurePoint(poses[holder]!, held.at, {
              x: fx,
              y: fy,
              radius,
            });
            ballX += (sx - ballX) * held.hold;
            ballY += (sy - ballY) * held.hold;
            ballHeight += (held.height - ballHeight) * held.hold;
          }
          // Reduced motion keeps the panels still (→WEB-46).
          const ball = ballLook(ballHeight, width, fh, still ? 0 : rolled * BALL_SPIN_PER_UNIT);
          // On the grass under the figures: the inspected player's chosen move and ring, and the
          // recorded carrier's ring (→WEB-95), so neither hides a number or the ball.
          for (const figure of figures) {
            const { motion } = figure;
            if (!inspect || !motion || motion.id !== selectedId) continue;
            ctx.strokeStyle = skin.selection;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(figure.x, figure.y);
            ctx.lineTo(x(motion.intent[0]), y(motion.intent[1]));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(x(motion.intent[0]), y(motion.intent[1]), 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(figure.x, figure.y, radius + 4, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          // A dark edge under the theme's mark keeps the carrier's cue clear on any ground or kit.
          const cueEdges = [
            ['#101314', 4.5],
            [carrierMark, 2.5],
          ] as const;
          if (carrier)
            for (const [colour, lineWidth] of cueEdges) {
              ctx.strokeStyle = colour;
              ctx.lineWidth = lineWidth;
              ctx.beginPath();
              ctx.arc(
                carrier.x,
                carrier.y,
                radius * CARRIER_MARK.ringScale + CARRIER_MARK.ringGap,
                0,
                Math.PI * 2,
              );
              ctx.stroke();
            }
          // Each side's recorded kit (or the unrecorded stand-in), its keeper in the keeper kit.
          const paint = (i: number) => {
            const { side, x: fx, y: fy, input } = figures[i]!;
            const { kit, keeperKit } = look.sides[side];
            painter.draw(ctx, poses[i]!, input.keeper ? keeperKit : kit, {
              x: fx,
              y: fy,
              radius,
              dpr: skin.pixelSize ? 1 / skin.pixelSize : dpr,
              look: looks.get(input.id) ?? playerLook(input.id),
              outline: carrierMark,
              // No figure is outlined, the carrier included: an outline grows his body (→WEB-95).
              outlineWidth: 0,
              ball: i === holder ? () => paintBall(ctx, ballX, ballY, ball, skin) : undefined,
            });
          };
          for (let i = 0; i < figures.length; i++) if (i !== holder && i !== carrierIndex) paint(i);
          if (carrierIndex >= 0 && carrierIndex !== holder) paint(carrierIndex);
          if (holder >= 0) paint(holder);
          else paintBall(ctx, ballX, ballY, ball, skin);
          // Numbers stay at twelve o'clock, every plate one size; the carrier's plate is coloured.
          const tags = placeNumberTags(
            figures.map(({ input, number, x: fx, y: fy }) => ({
              id: input.id,
              number,
              x: fx,
              y: fy,
              radius,
            })),
          );
          for (let i = 0; i < tags.length; i++)
            if (i !== carrierIndex) drawNumberTag(ctx, tags[i]!, tagStyle);
          if (carrier) drawNumberTag(ctx, tags[carrierIndex]!, carrierTagStyle);
        } else {
          ctx.fillStyle = skin.idleText;
          ctx.font = `14px ${pitchFont}`;
          ctx.textAlign = 'center';
          ctx.fillText(displayMessage('copy.FixtureNotebook.5dc1ae4f9a'), width / 2, height / 2);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [
    p,
    samples,
    timed,
    length,
    preparations,
    goals,
    track,
    travel,
    numbers,
    windows,
    distances,
    looks,
    paused,
    speed,
    look,
    keepers,
    painter,
    ground,
    skin,
    inspect,
    selectedId,
    endReplay,
    noteSeen,
  ]);

  useEffect(() => {
    // Keyboard focus follows the clip's controls: onto its return, then back to the shortcut.
    if (replay) replayReturn.current?.focus({ preventScroll: true });
    else if (refocusReplay.current) replayOpen.current?.focus({ preventScroll: true });
    refocusReplay.current = false;
  }, [replay]);

  const seek = (index: number) => {
    const target = Math.max(0, Math.min(samples.length - 1, index));
    // An explicit seek leaves a clip for the original viewing at its new place and speed.
    const clip = replaying.current;
    if (clip) {
      replaying.current = undefined;
      setReplay(undefined);
      setSpeed(clip.origin.speed);
    }
    // A seek ends any cue and passes the goals up to its place without celebrating them.
    clock.current = seekGoalFeedback(goals, samples[Math.floor(target)]?.time ?? 0);
    noteSeen(clock.current);
    setCue(undefined);
    setShownGoals(goalsShown(clock.current));
    setSampleIndex(Math.floor(target));
    if (p && index < samples.length - 1) onPlaybackStart?.(p.record.id);
  };
  const reveal = () => {
    seek(samples.length - 1);
    setPaused(true);
  };
  const toggle = () => {
    if (!p) return;
    // A clip pauses and resumes itself; it never restarts the original playback.
    if (replay) {
      setPaused(!paused);
      return;
    }
    if (finished) seek(0);
    setPaused(finished ? false : !paused);
  };
  // A picked goal plays its clip; one whose footage was not retained keeps the moment navigation.
  const replayGoal = (pick: ReplayGoal) => {
    if (!p) return;
    const origin = {
      matchId: p.record.id,
      clock: clock.current,
      sampleIndex,
      paused,
      speed,
      finished,
      ...replaying.current?.origin,
    };
    // A goal held now finishes first, even when the picker opened before it; the picker stays.
    if (!replayEntryOpen(origin.clock)) return;
    setPicking(false);
    const clip = startGoalReplay(goals, p.frames, pick, origin);
    if (!clip) {
      seek(sampleAt(p.frames, samples, p.frames[pick.frame]?.label ?? 'kickoff'));
      setPaused(true);
      return;
    }
    replaying.current = clip;
    clock.current = replayClock(clip);
    last.current = 0;
    lastUi.current = 0;
    setReplay(clip);
    setCue(undefined);
    setShownGoals(goalsShown(clock.current));
    const entry = locate(timed.times, clip.from, timed.sampleBreak);
    setSampleIndex(Math.min(samples.length - 1, Math.floor(entry + 1e-6)));
    setSpeed(GOAL_REPLAY_CONFIG.speed);
    setPaused(false);
  };
  // The scoring side's value during a goal hold is boxed and bold as well as coloured (→WEB-94).
  const scoreValue = (side: 0 | 1, value: number) => (
    <i
      className={heldGoal?.side === side ? t.goalScore : undefined}
      data-testid={heldGoal?.side === side ? 'goal-score' : undefined}
    >
      {localizeValue(value)}
    </i>
  );
  // A sheet over the match holds it still, and lets it play on as it was once closed.
  const hold = () => {
    if (resume.current === undefined) resume.current = !paused;
    setPaused(true);
  };
  const release = () => {
    if (resume.current) setPaused(false);
    resume.current = undefined;
  };
  const openDetails = () => {
    hold();
    setDetails(true);
  };
  const closeDetails = () => {
    setDetails(false);
    release();
  };
  const closePlayer = () => {
    setInspect(false);
    release();
  };
  // A tap on a player opens his sheet; it reports whether it found one.
  const pickPlayer = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!p) return false;
    const box = event.currentTarget.getBoundingClientRect();
    const at = [event.clientX - box.left, event.clientY - box.top] as const;
    let found: (typeof placed.current)[number] | undefined;
    let nearest = Math.max(18, placedRadius.current * 2.4);
    for (const figure of placed.current) {
      const distance = Math.hypot(figure.x - at[0], figure.y - at[1]);
      if (distance < nearest) {
        found = figure;
        nearest = distance;
      }
    }
    const hit = found;
    if (!hit) return false;
    const index = p.squads[hit.side].findIndex((player) => player.id === hit.id);
    if (index < 0) return false;
    setSelection(`${hit.side}:${index}`);
    hold();
    setInspect(true);
    return true;
  };
  const log = useMemo(
    () => (p && commentary ? commentaryLog(p.frames, sample?.frame ?? 0, sample?.within ?? 1) : []),
    [p, commentary, sample?.frame, sample?.within],
  );
  // A clip of a finished archive plays and pauses; it does not offer the restart.
  const ended = finished && !replay;
  const playLabel = ended
    ? sourceMessage('copy.LabPage.6bf1632192')
    : paused
      ? sourceMessage('copy.Pitch.d43a776c5e')
      : sourceMessage('copy.Pitch.4f51c0c8ad');
  // One red mark per player sent off up to the presented minute (→WEB-50).
  const redMarks = (side: 0 | 1) =>
    reds[side] > 0 && (
      <i
        className={t.reds}
        role="img"
        aria-label={displayMessage('copy.Pitch.4d8ae68c82', { p0: reds[side] })}
        data-testid={side === 0 ? 'red-cards-home' : 'red-cards-away'}
      >
        {localizeValue(Array.from({ length: reds[side] }, (_, i) => <i key={i} />))}
      </i>
    );
  return (
    <div
      className={`${s.pitch} ${t.pitch}`}
      data-testid="pitch-theatre"
      data-ui="match-theatre"
      style={
        {
          '--goal-hold': `${GOAL_FEEDBACK_CONFIG.holdMs}ms`,
          '--goal-pulses': GOAL_FEEDBACK_CONFIG.pulses,
        } as CSSProperties
      }
    >
      <div
        className={`${s.scoreboard} ${t.scoreboard}${halves ? ` ${t.kitHalves}` : ''}`}
        data-testid="match-score"
        data-possession={possession.state}
        data-possession-side={possession.side}
        data-ball-side={ballSide}
        style={
          halves
            ? ({
                // The side on the ball fills the whole board; before kick-off each keeps its half.
                '--home-kit': halves[ballSide ?? 0].background,
                '--home-ink': halves[ballSide ?? 0].ink,
                '--away-kit': halves[ballSide ?? 1].background,
                '--away-ink': halves[ballSide ?? 1].ink,
              } as CSSProperties)
            : undefined
        }
      >
        {localizeValue(lead)}
        <span className={t.team} data-ui="match-team" data-side="home">
          <i className={t.teamIdentity} data-ui="match-team-identity">
            {localizeValue(
              home && look && (
                <CrestMark
                  crest={look.sides[0].crest}
                  size={24}
                  label={localizeValue(
                    look.recorded
                      ? undefined
                      : sourceMessage('copy.Pitch.468471861a', { p0: home.name }),
                  )}
                />
              ),
            )}
            <b className={t.fullName}>{localizeValue(home?.name || 'HOME')}</b>
            <b className={t.shortName} aria-hidden="true">
              {localizeValue(home?.short || 'HOME')}
            </b>
            {localizeValue(redMarks(0))}
          </i>
        </span>
        {localizeValue(
          frame ? (
            // The score as presented so far: a goal later in this minute is not shown before it lands.
            <strong>
              <i className={t.score}>
                {localizeValue(scoreValue(0, presentedScore?.home ?? 0))}
                <i className={t.scoreColon}> : </i>
                {localizeValue(scoreValue(1, presentedScore?.away ?? 0))}
              </i>
            </strong>
          ) : (
            <strong>— : —</strong>
          ),
        )}
        <span className={`${t.team} ${t.awayTeam}`} data-ui="match-team" data-side="away">
          <i className={t.teamIdentity} data-ui="match-team-identity">
            {localizeValue(
              away && look && (
                <CrestMark
                  crest={look.sides[1].crest}
                  size={24}
                  label={localizeValue(
                    look.recorded
                      ? undefined
                      : sourceMessage('copy.Pitch.468471861a', { p0: away.name }),
                  )}
                />
              ),
            )}
            <b className={t.fullName}>{localizeValue(away?.name || 'AWAY')}</b>
            <b className={t.shortName} aria-hidden="true">
              {localizeValue(away?.short || 'AWAY')}
            </b>
            {localizeValue(redMarks(1))}
          </i>
        </span>
      </div>
      <div className={`${s.pitchMeta} ${t.pitchMeta}`} data-ui="match-meta">
        <span className={`${s.live} ${t.liveText}`}>
          {localizeValue(
            frame
              ? `${replay ? `${tr('match.replay.state')} · ` : ''}${frame.label}′ · ${frame.action}${finished && !replay ? sourceMessage('copy.Pitch.000578f677') : ''}`
              : 'MATCH DAY',
          )}
        </span>
        {/* A clip offers the ordinary speeds in archived replay too (→WEB-105). */}
        {localizeValue(
          p && (!summary || replay) ? (
            <div className={t.metaControls}>
              {localizeValue(
                !summary && (
                  <span className={t.matchup} data-ui="match-tactics">
                    {richMessage('copy.Pitch.de695ccbd9', {
                      p0: localizeValue(tacticLabel[p.record.tactics[0]]),
                      p1: localizeValue(tacticLabel[p.record.tactics[1]]),
                    })}
                  </span>
                ),
              )}
              <div
                className={t.speeds}
                role="radiogroup"
                aria-label={displayMessage('copy.Pitch.d65ad19603')}
              >
                {localizeValue(
                  WATCH_SPEEDS.map((value) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={speed === value}
                      className={speed === value ? t.speedOn : undefined}
                      onClick={() => {
                        setSpeed(value);
                        setPaused(false);
                      }}
                    >
                      {localizeValue(value)}×
                    </button>
                  )),
                )}
              </div>
            </div>
          ) : (
            <span className={t.tactics}>
              {localizeValue(
                summary
                  ? sourceMessage('copy.Pitch.5f7de66d10')
                  : sourceMessage('copy.Pitch.d450f890ba'),
              )}
            </span>
          ),
        )}
      </div>
      <div className={t.stage}>
        <canvas
          ref={canvas}
          aria-label={displayMessage('copy.Pitch.16255a93f6')}
          className={`${s.canvas} ${t.canvas} ${summary ? t.replayCanvas : ''}`}
          data-pickable={p ? true : undefined}
          onClick={(event) => {
            if (!pickPlayer(event) && summary) toggle();
          }}
        />
        {/* One polite region; its text changes once per goal, never on a rerender (→WEB-94). */}
        <div className={t.goalCueSlot} aria-live="polite">
          {localizeValue(
            heldGoal && (
              <div
                key={heldGoal.id}
                className={t.goalCue}
                data-ui="goal-cue"
                data-testid="goal-cue"
                data-side={heldGoal.side}
              >
                <strong>{localizeValue(tr('match.goal.cue'))}</strong>
                <span>
                  {localizeValue(
                    heldGoal.scorer
                      ? tr('match.goal.scorer', {
                          team: (heldGoal.side === 0 ? home : away)?.name ?? '',
                          player: heldGoal.scorer,
                        })
                      : tr('match.goal.side', {
                          team: (heldGoal.side === 0 ? home : away)?.name ?? '',
                        }),
                  )}
                </span>
              </div>
            ),
          )}
        </div>
        {/* A still beat's cards, injuries and substitutions (→WEB-32), named once per stoppage. */}
        <div className={t.stoppageSlot} aria-live="polite">
          {localizeValue(
            captions.length > 0 && (
              <div
                key={beat!.from}
                className={t.stoppage}
                data-ui="stoppage-caption"
                data-testid="stoppage-caption"
              >
                {localizeValue(
                  captions.map((caption, i) => (
                    <span key={i}>{localizeValue(tr(caption.key, caption.params))}</span>
                  )),
                )}
              </div>
            ),
          )}
        </div>
        {localizeValue(
          look && !look.recorded && (
            // Older playback: neutral stand-in kits, never today's designs presented as this match's.
            <span className={t.unrecorded} data-testid="match-kit-unrecorded">
              {localizeValue(UNRECORDED_KIT)}
            </span>
          ),
        )}
        {localizeValue(
          summary && (
            <button
              data-ui="icon"
              className={`${t.playToggle} ${paused || ended ? t.playIdle : ''}`}
              aria-label={localizeValue(playLabel)}
              disabled={!p}
              onClick={toggle}
            >
              <PixelIcon name={ended ? 'replay' : paused ? 'play' : 'pause'} size={24} />
            </button>
          ),
        )}
        {/* Goal-scene replay (→WEB-105): the shortcut, or the clip's label and return. */}
        {localizeValue(
          replay ? (
            <div
              className={`${t.replayControl} ${t.replayState} ${summary ? t.besideToggle : ''}`}
              data-ui="match-replay"
              data-testid="goal-replay-state"
            >
              <b>{localizeValue(tr('match.replay.state'))}</b>
              <button ref={replayReturn} onClick={endReplay}>
                {localizeValue(tr('match.replay.return'))}
              </button>
            </div>
          ) : (
            offered.length > 0 && (
              <button
                ref={replayOpen}
                className={`${t.replayControl} ${summary ? t.besideToggle : ''}`}
                data-testid="goal-replay-open"
                aria-haspopup="dialog"
                aria-disabled={replayHeld || undefined}
                onClick={() => {
                  if (!replayHeld) setPicking(true);
                }}
              >
                <PixelIcon name="replay" size={16} />
                {localizeValue(tr('match.replay.action'))}
              </button>
            )
          ),
        )}
      </div>
      <div className={t.latestEvent} data-testid="match-latest-event" data-ui="match-commentary">
        <span>
          {localizeValue(
            call
              ? `${call.label}′`
              : frame
                ? `${frame.label}′`
                : sourceMessage('copy.Pitch.abbef09626'),
          )}
        </span>
        <p>
          {localizeValue(
            call
              ? call.text
              : latestGoal
                ? `${latestGoal.minute}′ ${latestGoal.player} · ${latestGoal.action}`
                : sourceMessage('copy.Pitch.f845d001b4'),
          )}
        </p>
        {localizeValue(
          p && (
            <button
              type="button"
              className={t.commentaryToggle}
              aria-expanded={commentary}
              onClick={() => setCommentary(!commentary)}
            >
              {richMessage('copy.Pitch.9dbfc869c7', {
                p0: commentary
                  ? sourceMessage('copy.Pitch.6d758e7771')
                  : sourceMessage('copy.Pitch.29518875cb'),
              })}
            </button>
          ),
        )}
      </div>
      {localizeValue(
        commentary && (
          <ol
            className={t.commentaryLog}
            data-testid="match-commentary-log"
            aria-label={displayMessage('copy.Pitch.608c5fe57a')}
          >
            {localizeValue(
              log.length ? (
                log.map((line) => (
                  <li key={line.key}>
                    <span>{localizeValue(line.label)}′</span>
                    <p>{localizeValue(line.text)}</p>
                  </li>
                ))
              ) : (
                <li>
                  <p>{richMessage('copy.Pitch.8191961ec1')}</p>
                </li>
              ),
            )}
          </ol>
        ),
      )}
      {localizeValue(
        p && look && !summary && frame?.xg && (
          <MatchCharts
            playback={p}
            shown={(sample?.frame ?? 0) + 1}
            look={look}
            groundColor={skin.chartGround}
            names={[home?.short || 'HOME', away?.short || 'AWAY']}
            details={details}
            detailsId={detailsId}
            onDetails={openDetails}
          />
        ),
      )}
      {localizeValue(
        actions ? (
          actions({ finished, reveal })
        ) : (
          <div className={t.ownActions}>
            <button onClick={reveal} disabled={!p}>
              {richMessage('copy.LiveSeason.1547b2a6d2')}
            </button>
            <button aria-haspopup="dialog" disabled={!p} onClick={openDetails}>
              {richMessage('copy.MatchCharts.f57a1c78ca')}
            </button>
          </div>
        ),
      )}
      {localizeValue(
        details && (
          <Dialog label={displayMessage('copy.MatchCharts.f57a1c78ca')} wide onClose={closeDetails}>
            <div id={detailsId} className={t.details}>
              {localizeValue(
                p && (summary || finished || reviewedId === p.record.id) && (
                  <MatchMoments
                    live={!summary}
                    record={p.record}
                    frames={p.frames}
                    names={names}
                    onSeek={(moment) => {
                      seek(sampleAt(p.frames, samples, moment));
                      setPaused(true);
                    }}
                  />
                ),
              )}
              {localizeValue(
                p && (summary || finished) && (
                  <Suspense fallback={null}>
                    <MatchReport record={p.record} w={world} />
                  </Suspense>
                ),
              )}
              {localizeValue(
                p && (
                  <label className={s.replayScrubber}>
                    {richMessage('copy.Pitch.6ea97b709c', {
                      p0: (
                        <input
                          type="range"
                          aria-label={displayMessage('copy.Pitch.78239af671')}
                          min={0}
                          max={samples.length - 1}
                          value={sampleIndex}
                          onChange={(e) => {
                            seek(Number(e.target.value));
                            setPaused(true);
                          }}
                        />
                      ),
                      p1: (
                        <span>
                          {localizeValue(frame?.label ?? 0)}′ / {localizeValue(lastLabel)}′
                        </span>
                      ),
                    })}
                  </label>
                ),
              )}
              {localizeValue(
                frame && (!summary || finished) && (
                  <>
                    <div className={s.matchStats}>
                      {localizeValue(
                        [
                          [
                            sourceMessage('copy.stories.6169842c01'),
                            percent(frame.metrics[0][11], frame.minute),
                            percent(frame.metrics[1][11], frame.minute),
                          ],
                          [
                            sourceMessage('copy.Pitch.6402451e06'),
                            frame.xg?.[0].toFixed(2) ?? '—',
                            frame.xg?.[1].toFixed(2) ?? '—',
                          ],
                          [
                            sourceMessage('copy.summary.da1cc31972'),
                            frame.metrics[0][4],
                            frame.metrics[1][4],
                          ],
                          [
                            sourceMessage('copy.summary.2d9b22c49c'),
                            frame.metrics[0][5],
                            frame.metrics[1][5],
                          ],
                          [
                            sourceMessage('copy.Pitch.d488f908a0'),
                            percent(frame.metrics[0][3], frame.metrics[0][2]),
                            percent(frame.metrics[1][3], frame.metrics[1][2]),
                          ],
                          [
                            sourceMessage('copy.Pitch.3f6ba38a9e'),
                            frame.metrics[0][6],
                            frame.metrics[1][6],
                          ],
                          [
                            sourceMessage('copy.Pitch.818d05f8ab'),
                            frame.metrics[0][7],
                            frame.metrics[1][7],
                          ],
                        ].map(([label, a, b]) => (
                          <div key={label}>
                            <strong>{localizeValue(a)}</strong>
                            <span>{localizeValue(label)}</span>
                            <strong>{localizeValue(b)}</strong>
                          </div>
                        )),
                      )}
                    </div>
                    <ol className={s.highlights}>
                      {localizeValue(
                        p?.record.highlights
                          .filter((h) => h.minute <= frame.minute)
                          .map((h, i) => (
                            <li key={i}>
                              <b>{localizeValue(h.minute)}′</b> {localizeValue(h.player)} ·{' '}
                              {localizeValue(h.action)}
                            </li>
                          )),
                      )}
                    </ol>
                  </>
                ),
              )}
            </div>
          </Dialog>
        ),
      )}
      {localizeValue(
        inspect && selectedPlayer && (
          <Dialog
            label={localizeValue(
              `${selectedIndex + 1}. ${selectedPlayer.name} · ${(selectedSide === 0 ? home : away)?.name ?? ''}`,
            )}
            onClose={closePlayer}
          >
            <div className={s.playerInspector} data-testid="player-inspector">
              <p>
                {localizeValue(
                  selectedMotion ? (
                    <b>{localizeValue(motionLabel(selectedMotion))}</b>
                  ) : (
                    sourceMessage('copy.Pitch.f87c3afdbf', {
                      p0: selectedId && gone.has(selectedId) ? ` (${gone.get(selectedId)})` : '',
                    })
                  ),
                )}
              </p>
              {localizeValue(
                traits && (
                  <>
                    <div className={s.motionTraits}>
                      {localizeValue(
                        (
                          [
                            [sourceMessage('copy.Pitch.1c2f5a7c6d'), traits.freedom],
                            [sourceMessage('copy.Pitch.69023144c9'), traits.discipline],
                            [sourceMessage('copy.Pitch.9c9771b63b'), traits.pressing],
                            [sourceMessage('copy.Pitch.d3c2efa57e'), traits.anticipation],
                          ] as const
                        ).map(([label, value]) => (
                          <span key={label}>
                            {localizeValue(label)} {localizeValue(Math.round(value * 100))}
                            <progress aria-label={localizeValue(label)} max={1} value={value} />
                          </span>
                        )),
                      )}
                    </div>
                    <p className={s.muted}>{richMessage('copy.Pitch.c542b3ee41')}</p>
                  </>
                ),
              )}
            </div>
          </Dialog>
        ),
      )}
      {localizeValue(
        picking && p && (
          <Dialog
            label={localizeValue(tr('match.replay.action'))}
            picker
            onClose={() => setPicking(false)}
          >
            <ol className={t.replayGoals} data-testid="goal-replay-list">
              {localizeValue(
                offered.map((pick) => {
                  const { goal } = pick;
                  const team = (goal.side === 0 ? home : away)?.name ?? '';
                  return (
                    <li key={goal.id}>
                      <button
                        data-testid="goal-replay-option"
                        data-goal={goal.id}
                        data-footage={pick.footage}
                        aria-disabled={replayHeld || undefined}
                        onClick={() => replayGoal(pick)}
                      >
                        <b>
                          {localizeValue(goal.id + 1)}. {localizeValue(p.frames[pick.frame]?.label)}
                          ′ · {localizeValue(goal.home)} : {localizeValue(goal.away)}
                        </b>
                        <span>
                          {localizeValue(
                            goal.scorer
                              ? tr('match.goal.scorer', { team, player: goal.scorer })
                              : tr('match.goal.side', { team }),
                          )}
                          {localizeValue(!pick.footage && ` · ${tr('match.replay.seek')}`)}
                        </span>
                      </button>
                    </li>
                  );
                }),
              )}
            </ol>
            {localizeValue(
              offered.some((pick) => !pick.footage) && (
                <p className={s.muted} data-testid="goal-replay-unavailable">
                  {localizeValue(tr('match.replay.unavailable'))}
                </p>
              ),
            )}
            <p className={s.muted}>{localizeValue(tr('match.replay.note'))}</p>
          </Dialog>
        ),
      )}
    </div>
  );
}
