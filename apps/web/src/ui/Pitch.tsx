import { Select } from './Select';
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
  PlayerMotionState,
  World,
} from '../../../../packages/contracts/src/types';
import { MATCH_MOTION_CONFIG, motionTraits } from '../../../../packages/engine/src/match';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { percent } from './format';
// The report only shows once a match is over: it loads then, keeping it out of the entry (→ARCH-28).
const MatchReport = lazy(() =>
  import('./MatchReport').then((module) => ({ default: module.MatchReport })),
);
import { MatchMoments } from './MatchMoments';
import { MatchCharts } from './MatchCharts';
import { CrestMark } from './ClubCrest';
import { createKitPainter } from './kitPainting';
import { markerRadius } from './KitPitchPreview';
import { keepersBySample, matchLook, UNRECORDED_KIT } from './matchAppearance';
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
import {
  clockAt,
  locate,
  presentationLength,
  presentationSamples,
  runningSeconds,
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
/**
 * An archived match without motion stands each side in this fixed shape: an illustration of its
 * shirts, not of any recorded player, with the keeper on his line.
 */
const initialShape: { at: [number, number]; keeper?: true }[] = [
  { at: [5, 50], keeper: true },
  { at: [22, 15] },
  { at: [20, 38] },
  { at: [20, 62] },
  { at: [22, 85] },
  { at: [46, 25] },
  { at: [43, 50] },
  { at: [46, 75] },
  { at: [72, 20] },
  { at: [76, 50] },
  { at: [72, 80] },
];
/** The side outline every marker wears, as in the design preview (WEB-87). */
const MARKER_OUTLINE = '#ffffffcc';
/** Height (pitch units) at which a lofted ball reaches its largest drawn size. */
const BALL_PEAK = MATCH_MOTION_CONFIG.ball.maxLoft;

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
  /**
   * Presentation time in ms at 1x, every match minute lasting 4000 ms (→WEB-32), with the recorded
   * goal it holds at (→WEB-94).
   */
  const clock = useRef<GoalFeedbackState>({ clockMs: 0, next: 0 });
  const last = useRef(0);
  const lastUi = useRef(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [sampleMatchId, setSampleMatchId] = useState(p?.record.id);
  // The held goal's cue and the goals shown so far, mirrored from the clock for rendering.
  const [cue, setCue] = useState<number>();
  const [shownGoals, setShownGoals] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [details, setDetails] = useState(false);
  const [reviewedId, setReviewedId] = useState<string>();
  const [selection, setSelection] = useState('0:8');
  // Every sample and recorded ball position at its match time, so a pass flies at its real speed.
  const timed = useMemo(() => presentationSamples(p?.frames ?? []), [p]);
  const { samples, track } = timed;
  const length = presentationLength(p?.frames.length ?? 0);
  const goals = useMemo(() => {
    if (!p) return [];
    const starts: number[] = [];
    for (const sample of samples) starts[sample.frame] ??= sample.time;
    return goalInstants(p.record, p.frames, starts);
  }, [p, samples]);
  // Each player's place in his matchday roster (starters, then the bench) numbers his dot.
  const numbers = useMemo(
    () => new Map(p?.squads.flatMap((squad) => squad.map((player, i) => [player.id, i] as const))),
    [p],
  );
  const names = useMemo(
    () => new Map(p?.squads.flatMap((squad) => squad.map((player) => [player.id, player.name]))),
    [p],
  );
  // What both sides wore, from the record's own snapshot only (KIT-12): resolved once per record,
  // so editing a club's design while watching never repaints this match.
  const look = useMemo(() => (p ? matchLook(p.record) : undefined), [p]);
  // Who is in goal in each sample, found by player over the whole matchday roster.
  const keepers = useMemo(() => keepersBySample(samples, p?.squads ?? [[], []]), [samples, p]);
  // One painter, and so one sprite cache, per mounted pitch: rAF only blits cached shirts.
  const [painter] = useState(() => createKitPainter());
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
  const traits = selectedPlayer ? motionTraits(selectedPlayer) : undefined;
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
    clock.current = { clockMs: 0, next: 0 };
    lastUi.current = 0;
    setSampleIndex(0);
    setCue(undefined);
    setShownGoals(0);
    setSampleMatchId(p?.record.id);
    setSelection('0:8');
    setDetails(false);
    setInspect(false);
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
    // Build the four shirt sprites (both outfield shirts, both keepers) for the size the pitch is
    // drawn at before the frame loop needs them, and again when that size changes, so the loop
    // below only blits cached sprites (ARCH-7).
    const element = canvas.current;
    const scratch = element && look ? document.createElement('canvas').getContext('2d') : null;
    if (!element || !look || !scratch) return;
    const warm = () => {
      const width = element.clientWidth;
      if (!width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const radius = markerRadius(width);
      for (const side of look.sides)
        for (const shirt of [side.shirt, side.keeper])
          painter.draw(scratch, shirt, radius, radius, radius, { dpr });
    };
    warm();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(warm);
    observer.observe(element);
    return () => observer.disconnect();
  }, [look, painter]);

  useEffect(() => {
    let raf = 0;
    last.current = 0;
    const pitchFont = canvas.current
      ? getComputedStyle(canvas.current).fontFamily
      : 'Galmuri11, sans-serif';
    const draw = (time: number) => {
      const elapsed = last.current ? Math.min(60, time - last.current) : 0;
      last.current = time;
      const end = Math.max(0, samples.length - 1);
      if (p) {
        clock.current = advanceGoalFeedback(clock.current, goals, {
          elapsedMs: elapsed,
          speed,
          lengthMs: length,
          running: !paused && !document.hidden,
        });
        // Only a new cue or goal re-renders; a held goal keeps one cue however often this runs.
        setCue(clock.current.cue?.goal);
        setShownGoals(goalsShown(clock.current));
      }
      const now = runningSeconds(clock.current.clockMs);
      const position = Math.min(end, locate(timed.times, now, timed.sampleBreak));
      const index = Math.min(end, Math.floor(position + 1e-6));
      const element = canvas.current;
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
        ctx.fillStyle = '#253b31';
        ctx.fillRect(0, 0, width, height);
        const pad = width * 0.065;
        const fw = width - pad * 2;
        const fh = height - pad * 2;
        const x = (v: number) => pad + (fw * v) / 100;
        const y = (v: number) => pad + (fh * v) / 100;
        // Mown stripes.
        for (let stripe = 0; stripe < 10; stripe++) {
          ctx.fillStyle = stripe % 2 ? '#2b4538' : '#304b3d';
          ctx.fillRect(pad + (fw * stripe) / 10, pad, fw / 10 + 0.5, fh);
        }
        ctx.strokeStyle = '#d7dcc598';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(pad, pad, fw, fh);
        ctx.beginPath();
        ctx.moveTo(x(50), pad);
        ctx.lineTo(x(50), y(100));
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x(50), y(50), fw * 0.09, fh * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (const side of [0, 1]) {
          ctx.strokeRect(x(side === 0 ? 0 : 82), y(22), fw * 0.18, fh * 0.56);
          ctx.strokeRect(x(side === 0 ? 0 : 94), y(38), fw * 0.06, fh * 0.24);
          // Goal mouths.
          ctx.fillStyle = '#e8efe6aa';
          ctx.fillRect(side === 0 ? pad - 4 : x(100), y(44), 4, fh * 0.12);
        }
        if (p && current && look) {
          const radius = markerRadius(width);
          const marker = {
            dpr,
            outline: MARKER_OUTLINE,
            font: `${Math.max(8, width * 0.012)}px ${pitchFont}`,
          };
          for (const side of [0, 1] as const) {
            const { shirt, keeper: keeperShirt } = look.sides[side];
            const keeper = keepers[index]?.[side];
            // The players on the pitch in this sample; an archived match without motion stands
            // its sides in a fixed shape.
            const dots =
              current.players?.[side].map((motion) => ({
                motion,
                position: motion.position,
                target: next.players?.[side]?.find((m) => m.id === motion.id)?.position,
                number: (numbers.get(motion.id) ?? 0) + 1,
                keeper: motion.id === keeper,
              })) ??
              initialShape.map((base, i) => ({
                motion: undefined,
                position: [side === 0 ? base.at[0] : 100 - base.at[0], base.at[1]] as [
                  number,
                  number,
                ],
                target: undefined,
                number: i + 1,
                keeper: !!base.keeper,
              }));
            for (const { motion, position, target, number, keeper: isKeeper } of dots) {
              const px = position[0] * (1 - mix) + (target?.[0] ?? position[0]) * mix;
              const py = position[1] * (1 - mix) + (target?.[1] ?? position[1]) * mix;
              const selected = inspect && !!motion && motion.id === selectedId;
              if (selected && motion) {
                ctx.strokeStyle = '#f1f0e8';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(x(px), y(py));
                ctx.lineTo(x(motion.intent[0]), y(motion.intent[1]));
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(x(motion.intent[0]), y(motion.intent[1]), 4, 0, Math.PI * 2);
                ctx.stroke();
              }
              if (selected) {
                ctx.beginPath();
                ctx.arc(x(px), y(py), radius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = '#f1f0e8';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              // The side's recorded shirt with its pattern and trim (or the unrecorded stand-in),
              // or its keeper's colour.
              painter.draw(ctx, isKeeper ? keeperShirt : shirt, x(px), y(py), radius, {
                ...marker,
                number,
              });
            }
          }
          let bx = current.ball[0] * (1 - mix) + next.ball[0] * mix;
          let by = current.ball[1] * (1 - mix) + next.ball[1] * mix;
          let bh = 0;
          if (track.length) {
            const g = locate(timed.trackTimes, now, timed.trackBreak);
            const a = track[Math.floor(g)]!,
              b = track[Math.ceil(g)]!,
              f = g - Math.floor(g);
            bx = a[0] * (1 - f) + b[0] * f;
            by = a[1] * (1 - f) + b[1] * f;
            bh = a[2] * (1 - f) + b[2] * f;
          }
          // The shadow stays on the ground; a lofted ball rises above it and looks closer.
          const air = Math.min(1, Math.max(0, bh) / BALL_PEAK);
          const ballRadius = Math.max(3.2, width * 0.0065) * (1 + air * 0.35);
          const shadowRadius = Math.max(3.2, width * 0.0065) * (1 - air * 0.3);
          const lift = (Math.max(0, bh) * fh) / 100;
          ctx.fillStyle = `rgba(0, 0, 0, ${0.4 - air * 0.18})`;
          ctx.beginPath();
          ctx.ellipse(x(bx) + 1.5, y(by) + 2, shadowRadius, shadowRadius * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x(bx), y(by) - lift, ballRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#21392a';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#d8e4d6';
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
    goals,
    track,
    numbers,
    paused,
    speed,
    look,
    keepers,
    painter,
    inspect,
    selectedId,
  ]);

  const seek = (index: number) => {
    const target = Math.max(0, Math.min(samples.length - 1, index));
    // A seek ends any cue and passes the goals up to its place without celebrating them.
    clock.current = seekGoalFeedback(goals, clockAt(samples[Math.floor(target)]?.time ?? 0));
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
      style={
        {
          '--goal-hold': `${GOAL_FEEDBACK_CONFIG.holdMs}ms`,
          '--goal-pulses': GOAL_FEEDBACK_CONFIG.pulses,
        } as CSSProperties
      }
    >
      <div className={`${s.scoreboard} ${t.scoreboard}`} data-testid="match-score">
        {lead}
        <span className={t.team}>
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
        <span className={`${t.team} ${t.awayTeam}`}>
          {redMarks(1)}
          <b className={t.fullName}>{away?.name || 'AWAY'}</b>
          <b className={t.shortName} aria-hidden="true">
            {away?.short || 'AWAY'}
          </b>
          {away && look && (
            <CrestMark
              crest={look.sides[1].crest}
              size={24}
              label={look.recorded ? undefined : `${away.name} 엠블럼 미기록`}
            />
          )}
        </span>
      </div>
      <div className={`${s.pitchMeta} ${t.pitchMeta}`}>
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
        {look && !look.recorded && (
          // Older playback: neutral markers, never today's designs presented as this match's.
          <span className={t.unrecorded} data-testid="match-kit-unrecorded">
            {UNRECORDED_KIT}
          </span>
        )}
        {summary && (
          <button
            className={`${t.playToggle} ${paused || finished ? t.playIdle : ''}`}
            aria-label={playLabel}
            disabled={!p}
            onClick={toggle}
          >
            <span
              aria-hidden="true"
              className={finished ? t.iconReplay : paused ? t.iconPlay : t.iconPause}
            />
          </button>
        )}
        {p && !summary && (
          <span className={t.tactics}>
            {tacticLabel[p.record.tactics[0]]} vs {tacticLabel[p.record.tactics[1]]}
          </span>
        )}
      </div>
      <div className={t.latestEvent} data-testid="match-latest-event">
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
        {inspect && selectedPlayer && traits && (
          <div className={s.playerInspector}>
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
                  <b>{stateLabels[selectedMotion.state]}</b> · 점선은 이 선수가 선택한 이동
                  목표입니다.
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
            <div className={s.motionTraits}>
              {(
                [
                  ['자유도', traits.freedom],
                  ['규율', traits.discipline],
                  ['압박 성향', traits.aggression],
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
              능력과 개인 성향에 전술·체력·주변 선수 위치가 함께 작용합니다.
            </p>
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
