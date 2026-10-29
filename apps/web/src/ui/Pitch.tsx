import { Select } from './Select';
import { PixelIcon } from './PixelIcon';
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { useLocale } from '../presentation/react';
import { possessionKey, resolvePossessionCue, type PossessionCue } from './possessionCue';
import {
  beatAt,
  beatCaptions,
  deadBallBeats,
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
  shape: '포메이션 유지',
  support: '패스 지원',
  run: '빈 공간 침투',
  press: '볼 압박',
  mark: '상대 마크',
  recover: '수비 복귀',
  carry: '볼 운반',
  keeper: '골문 보호',
};
/** Intentions the inspector names by their own label rather than their motion state's (→MATCH-32). */
const intentionLabels: Partial<Record<NonNullable<PlayerMotion['intention']>['kind'], string>> = {
  screen: '길목 차단',
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

const phaseLabels = {
  possession: '볼 운반',
  transition: '공수 전환',
  pass: '패스 진행',
  shot: '슈팅',
  restart: '경기 재개',
};

/**
 * The latest event the presentation has reached: this minute's up to `within` of it, else the last
 * of an earlier minute. Whistles narrate too; an event without text is skipped.
 */
export function latestEvent(
  frames: MatchFrame[],
  index: number,
  within: number,
): MatchEvent | undefined {
  for (let i = Math.min(index, frames.length - 1); i >= 0; i--) {
    const events = frames[i]!.events ?? [];
    for (let j = events.length - 1; j >= 0; j--) {
      const event = events[j]!;
      if (event.text && (i < index || event.t <= within * 60)) return event;
    }
  }
  return undefined;
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
  const [speed, setSpeed] = useState<number>(WATCH_DEFAULT_SPEED);
  const [paused, setPaused] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [details, setDetails] = useState(false);
  const [reviewedId, setReviewedId] = useState<string>();
  const [selection, setSelection] = useState('0:8');
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
  // The final recorded goal finishes its cue before the match does.
  const finished =
    !!p &&
    onRecord &&
    sampleIndex >= samples.length - 1 &&
    cue === undefined &&
    shownGoals >= goals.length;
  const heldGoal = onRecord && cue !== undefined ? goals[cue] : undefined;
  const presentedScore = onRecord ? goals[shownGoals - 1] : undefined;
  const home = world.clubs.find((c) => c.id === p?.record.home);
  const away = world.clubs.find((c) => c.id === p?.record.away);
  const selectedPlayer = p?.squads[selectedSide]?.[selectedIndex];
  const selectedId = selectedPlayer?.id;
  const selectedMotion = sample?.players?.[selectedSide]?.find((m) => m.id === selectedId);
  // The inspector lists the players on the pitch now by ID (the presented sample's players before a
  // minute records them), then each side's bench: everyone else of the matchday squad.
  const onPitch = ([0, 1] as const).map((side) => {
    const ids = frame?.onPitch[side].length
      ? frame.onPitch[side]
      : (sample?.players?.[side].map((motion) => motion.id) ?? []);
    return new Set(ids);
  });
  const reds = p ? sentOff(p.record, p.frames, sample?.frame ?? 0) : [0, 0];
  // Why a player has left the pitch so far: sent off, substituted or injured.
  const gone = new Map(
    (p?.record.incidents ?? []).flatMap((incident) =>
      incident.kind === 'yellow' || incidentFrame(p!.frames, incident) > (sample?.frame ?? 0)
        ? []
        : [
            [
              incident.player,
              incident.kind === 'sub' ? '교체' : incident.kind === 'injury' ? '부상' : '퇴장',
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
  // The event the pitch is playing out now, narrated by the engine (→MATCH-24).
  const currentEvent = p
    ? latestEvent(p.frames, sample?.frame ?? 0, sample?.within ?? 1)
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
      const elapsed = last.current ? Math.min(60, time - last.current) : 0;
      last.current = time;
      const end = Math.max(0, samples.length - 1);
      if (p) {
        clock.current = advanceGoalFeedback(clock.current, goals, {
          elapsedMs: elapsed,
          speed,
          length,
          running: !paused && !document.hidden,
          preparations,
        });
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
        const pad = width * 0.065;
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
          ctx.fillText('킥오프를 기다립니다', width / 2, height / 2);
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
  ]);

  const seek = (index: number) => {
    const target = Math.max(0, Math.min(samples.length - 1, index));
    // A seek ends any cue and passes the goals up to its place without celebrating them.
    clock.current = seekGoalFeedback(goals, samples[Math.floor(target)]?.time ?? 0);
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
    if (finished) seek(0);
    setPaused(finished ? false : !paused);
  };
  // The scoring side's value during a goal hold is boxed and bold as well as coloured (→WEB-94).
  const scoreValue = (side: 0 | 1, value: number) => (
    <i
      className={heldGoal?.side === side ? t.goalScore : undefined}
      data-testid={heldGoal?.side === side ? 'goal-score' : undefined}
    >
      {value}
    </i>
  );
  // Both slots stay in the layout when possession clears or switches sides.
  const possessionBadge = (side: 0 | 1) => (
    <i
      className={t.possession}
      data-ui="possession-cue"
      role="img"
      aria-label={tr('match.possession.side')}
      aria-hidden={possession.side !== side}
      style={{ visibility: possession.side === side ? 'visible' : 'hidden' }}
      data-testid={possession.side === side ? 'possession-cue' : undefined}
      data-state={possession.state}
    >
      <i aria-hidden="true" className={t.possessionBall} />
      <i aria-hidden="true" className={t.possessionWord}>
        {tr('match.possession.word')}
      </i>
    </i>
  );
  const playLabel = finished ? '다시 보기' : paused ? '재생' : '일시정지';
  // One red mark per player sent off up to the presented minute (→WEB-50).
  const redMarks = (side: 0 | 1) =>
    reds[side] > 0 && (
      <i
        className={t.reds}
        role="img"
        aria-label={`퇴장 ${reds[side]}명`}
        data-testid={side === 0 ? 'red-cards-home' : 'red-cards-away'}
      >
        {Array.from({ length: reds[side] }, (_, i) => (
          <i key={i} />
        ))}
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
        style={
          halves
            ? ({
                '--home-kit': halves[0].background,
                '--home-ink': halves[0].ink,
                '--away-kit': halves[1].background,
                '--away-ink': halves[1].ink,
              } as CSSProperties)
            : undefined
        }
      >
        {lead}
        <span className={t.team} data-ui="match-team" data-side="home">
          <i className={t.teamIdentity} data-ui="match-team-identity">
            {home && look && (
              <CrestMark
                crest={look.sides[0].crest}
                size={24}
                label={look.recorded ? undefined : `${home.name} 엠블럼 미기록`}
              />
            )}
            <b className={t.fullName}>{home?.name || 'HOME'}</b>
            <b className={t.shortName} aria-hidden="true">
              {home?.short || 'HOME'}
            </b>
            {redMarks(0)}
          </i>
          {possessionBadge(0)}
        </span>
        {frame ? (
          // The score as presented so far: a goal later in this minute is not shown before it lands.
          <strong>
            <i className={t.score}>
              {scoreValue(0, presentedScore?.home ?? 0)}
              <i className={t.scoreColon}> : </i>
              {scoreValue(1, presentedScore?.away ?? 0)}
            </i>
          </strong>
        ) : (
          <strong>— : —</strong>
        )}
        <span className={`${t.team} ${t.awayTeam}`} data-ui="match-team" data-side="away">
          {possessionBadge(1)}
          <i className={t.teamIdentity} data-ui="match-team-identity">
            {away && look && (
              <CrestMark
                crest={look.sides[1].crest}
                size={24}
                label={look.recorded ? undefined : `${away.name} 엠블럼 미기록`}
              />
            )}
            <b className={t.fullName}>{away?.name || 'AWAY'}</b>
            <b className={t.shortName} aria-hidden="true">
              {away?.short || 'AWAY'}
            </b>
            {redMarks(1)}
          </i>
        </span>
      </div>
      <div className={`${s.pitchMeta} ${t.pitchMeta}`} data-ui="match-meta">
        <span className={`${s.live} ${t.liveText}`}>
          {frame
            ? `${frame.label}′ · ${frame.action}${finished ? ' · 경기 종료' : ''}`
            : 'MATCH DAY'}
        </span>
        {p && !summary ? (
          <div className={t.speeds} role="radiogroup" aria-label="관전 속도">
            {WATCH_SPEEDS.map((value) => (
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
                {value}×
              </button>
            ))}
          </div>
        ) : (
          <span className={t.tactics}>
            {summary
              ? '지난 경기 · 기록된 골과 최종 통계'
              : '다음 경기를 선택하면 관전이 시작됩니다'}
          </span>
        )}
      </div>
      {details && inspect && sample?.phase && (
        <div className={s.pitchMeta}>
          <span>{phaseLabels[sample.phase]}</span>
          <span>
            {sample.ownerId
              ? `볼 소유 · ${p?.squads.flat().find((player) => player.id === sample.ownerId)?.name || '선수'}`
              : '공 이동 중'}
          </span>
        </div>
      )}
      <div className={t.stage}>
        <canvas
          ref={canvas}
          aria-label="22명의 선수와 공으로 표현하는 경기"
          className={`${s.canvas} ${t.canvas} ${summary ? t.replayCanvas : ''}`}
          onClick={summary ? toggle : undefined}
        />
        {/* One polite region; its text changes once per goal, never on a rerender (→WEB-94). */}
        <div className={t.goalCueSlot} aria-live="polite">
          {heldGoal && (
            <div
              key={heldGoal.id}
              className={t.goalCue}
              data-ui="goal-cue"
              data-testid="goal-cue"
              data-side={heldGoal.side}
            >
              <strong>{tr('match.goal.cue')}</strong>
              <span>
                {heldGoal.scorer
                  ? tr('match.goal.scorer', {
                      team: (heldGoal.side === 0 ? home : away)?.name ?? '',
                      player: heldGoal.scorer,
                    })
                  : tr('match.goal.side', {
                      team: (heldGoal.side === 0 ? home : away)?.name ?? '',
                    })}
              </span>
            </div>
          )}
        </div>
        {/* A still beat's cards, injuries and substitutions (→WEB-32), named once per stoppage. */}
        <div className={t.stoppageSlot} aria-live="polite">
          {captions.length > 0 && (
            <div
              key={beat!.from}
              className={t.stoppage}
              data-ui="stoppage-caption"
              data-testid="stoppage-caption"
            >
              {captions.map((caption, i) => (
                <span key={i}>{tr(caption.key, caption.params)}</span>
              ))}
            </div>
          )}
        </div>
        {look && !look.recorded && (
          // Older playback: neutral stand-in kits, never today's designs presented as this match's.
          <span className={t.unrecorded} data-testid="match-kit-unrecorded">
            {UNRECORDED_KIT}
          </span>
        )}
        {summary && (
          <button
            data-ui="icon"
            className={`${t.playToggle} ${paused || finished ? t.playIdle : ''}`}
            aria-label={playLabel}
            disabled={!p}
            onClick={toggle}
          >
            <PixelIcon name={finished ? 'replay' : paused ? 'play' : 'pause'} size={24} />
          </button>
        )}
        {p && !summary && (
          <span className={t.tactics} data-ui="match-tactics">
            {tacticLabel[p.record.tactics[0]]} vs {tacticLabel[p.record.tactics[1]]}
          </span>
        )}
      </div>
      <div className={t.latestEvent} data-testid="match-latest-event" data-ui="match-commentary">
        <span>{frame ? `${frame.label}′` : '최근 장면'}</span>
        <p>
          {currentEvent
            ? currentEvent.text
            : latestGoal
              ? `${latestGoal.minute}′ ${latestGoal.player} · ${latestGoal.action}`
              : frame
                ? frame.action
                : '다음 경기를 시작하고 우리 선발의 활약을 지켜보세요.'}
        </p>
      </div>
      {p && look && !summary && frame?.xg && (
        <MatchCharts
          playback={p}
          shown={(sample?.frame ?? 0) + 1}
          look={look}
          groundColor={skin.chartGround}
          names={[home?.short || 'HOME', away?.short || 'AWAY']}
          details={details}
          detailsId={detailsId}
          onDetails={() => {
            setDetails(!details);
            if (details) setInspect(false);
          }}
        />
      )}
      {actions ? (
        actions({ finished, reveal })
      ) : (
        <div className={t.ownActions}>
          <button onClick={reveal} disabled={!p}>
            결과 보기
          </button>
          <button
            aria-expanded={details}
            aria-controls={detailsId}
            disabled={!p}
            onClick={() => {
              setDetails(!details);
              if (details) setInspect(false);
            }}
          >
            경기 상세
          </button>
        </div>
      )}
      <div id={detailsId} hidden={!details} className={t.details}>
        {p && (summary || finished || reviewedId === p.record.id) && (
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
        )}
        {p && (summary || finished) && (
          <Suspense fallback={null}>
            <MatchReport record={p.record} w={world} />
          </Suspense>
        )}
        {p && (
          <label className={s.replayScrubber}>
            경기 시간
            <input
              type="range"
              aria-label="경기 시간"
              min={0}
              max={samples.length - 1}
              value={sampleIndex}
              onChange={(e) => {
                seek(Number(e.target.value));
                setPaused(true);
              }}
            />
            <span>
              {frame?.label ?? 0}′ / {lastLabel}′
            </span>
          </label>
        )}
        {!!sample?.players && (
          <button
            className={s.inspectorToggle}
            aria-expanded={inspect}
            onClick={() => setInspect(!inspect)}
          >
            {inspect ? '선수 판단 접기' : '선수 판단 보기'}
          </button>
        )}
        {inspect && selectedPlayer && (
          <div data-surface="sheet" className={s.playerInspector}>
            <label>
              살펴볼 선수
              <Select
                aria-label="살펴볼 선수"
                value={selection}
                onValueChange={(value) => setSelection(value)}
              >
                {p?.squads.map((squad, side) => (
                  <optgroup key={side} label={side === 0 ? home?.name : away?.name}>
                    {squad.flatMap((player, i) =>
                      onPitch[side]!.has(player.id) || selection === `${side}:${i}`
                        ? [
                            <option key={player.id} value={`${side}:${i}`}>
                              {i + 1}. {player.name} · {player.position}
                            </option>,
                          ]
                        : [],
                    )}
                  </optgroup>
                ))}
              </Select>
            </label>
            <p>
              {selectedMotion ? (
                <>
                  <b>{motionLabel(selectedMotion)}</b> · 점선은 이 선수가 선택한 이동 목표입니다.
                </>
              ) : (
                `지금은 경기장에 없는 선수입니다${selectedId && gone.has(selectedId) ? ` (${gone.get(selectedId)})` : ''}.`
              )}
            </p>
            {p?.squads.map((squad, side) => {
              const bench = squad.flatMap((player, i) =>
                onPitch[side]!.has(player.id)
                  ? []
                  : [
                      `${i + 1}. ${player.name}${gone.has(player.id) ? ` (${gone.get(player.id)})` : ''}`,
                    ],
              );
              return (
                !!bench.length && (
                  <p key={side} className={s.muted} data-testid="match-bench">
                    {(side === 0 ? home : away)?.short} 벤치 · {bench.join(', ')}
                  </p>
                )
              );
            })}
            {traits && (
              <>
                <div className={s.motionTraits}>
                  {(
                    [
                      ['자유도', traits.freedom],
                      ['규율', traits.discipline],
                      ['압박 성향', traits.pressing],
                      ['예측력', traits.anticipation],
                    ] as const
                  ).map(([label, value]) => (
                    <span key={label}>
                      {label} {Math.round(value * 100)}
                      <progress aria-label={label} max={1} value={value} />
                    </span>
                  ))}
                </div>
                <p className={s.muted}>
                  자유도는 감독이 역할과 판단력을 보고 주는 재량이고, 규율·압박 성향·예측력은 능력과
                  개인 성향에서 나옵니다.
                </p>
              </>
            )}
          </div>
        )}
        {frame && (!summary || finished) && (
          <>
            <div className={s.matchStats}>
              {[
                [
                  '점유율',
                  percent(frame.metrics[0][11], frame.minute),
                  percent(frame.metrics[1][11], frame.minute),
                ],
                [
                  '기대 득점 (xG)',
                  frame.xg?.[0].toFixed(2) ?? '—',
                  frame.xg?.[1].toFixed(2) ?? '—',
                ],
                ['슈팅', frame.metrics[0][4], frame.metrics[1][4]],
                ['유효 슈팅', frame.metrics[0][5], frame.metrics[1][5]],
                [
                  '패스 성공',
                  percent(frame.metrics[0][3], frame.metrics[0][2]),
                  percent(frame.metrics[1][3], frame.metrics[1][2]),
                ],
                ['태클', frame.metrics[0][6], frame.metrics[1][6]],
                ['인터셉트', frame.metrics[0][7], frame.metrics[1][7]],
              ].map(([label, a, b]) => (
                <div key={label}>
                  <strong>{a}</strong>
                  <span>{label}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>
            <ol className={s.highlights}>
              {p?.record.highlights
                .filter((h) => h.minute <= frame.minute)
                .map((h, i) => (
                  <li key={i}>
                    <b>{h.minute}′</b> {h.player} · {h.action}
                  </li>
                ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
