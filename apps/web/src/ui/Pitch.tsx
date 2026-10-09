import { Select } from './Select';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  MatchEvent,
  MatchPlayback,
  MatchFrame,
  MatchMotionSample,
  PlayerMotion,
  PlayerMotionState,
  World,
} from '../../../../packages/contracts/src/types';
import { playerTraits } from '../../../../packages/engine/src/match';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { percent } from './format';
import { MatchReport } from './MatchReport';
import { MatchMoments } from './MatchMoments';
import { MatchCharts } from './MatchCharts';
import { CrestMark } from './ClubCrest';
import { crestOf, inkOn, kits } from './crests';
import { sampleAtMinute } from './moments';
import { presentationAdvance, WATCH_SPEEDS } from './presentationClock';
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
const initialShape: [number, number][] = [
  [5, 50],
  [22, 15],
  [20, 38],
  [20, 62],
  [22, 85],
  [46, 25],
  [43, 50],
  [46, 75],
  [72, 20],
  [76, 50],
  [72, 80],
];
/** Motion integration steps per simulated minute and between two player samples. */
const STEPS_PER_MINUTE = 40;
const STEPS_PER_SAMPLE = 5;
interface Sample {
  frame: number;
  ball: [number, number];
  players?: [PlayerMotion[], PlayerMotion[]];
  phase?: MatchMotionSample['phase'];
  ownerId?: string;
  /** Global ball-track step this sample was taken at, when the minute recorded a track. */
  step?: number;
  /** Sample position inside its minute, 0–1. */
  within: number;
}

const phaseLabels = {
  possession: '볼 운반',
  transition: '공수 전환',
  pass: '패스 진행',
  shot: '슈팅',
  restart: '경기 재개',
};

/** One duel of the chain in words, with the players who took part. */
export function describeEvent(event: MatchEvent, squads: MatchPlayback['squads']) {
  const name = (side: 0 | 1, slot?: number) =>
    slot === undefined ? '' : squads[side]?.[slot]?.name || '선수';
  const other: 0 | 1 = event.side === 0 ? 1 : 0;
  const actor = name(event.side, event.actor),
    receiver = name(event.side, event.receiver),
    opponent = name(other, event.opponent);
  if (event.kind === 'shot')
    return event.outcome === 'goal'
      ? `골! ${actor} · xG ${event.xg?.toFixed(2)}`
      : event.outcome === 'save'
        ? `${actor} 슈팅 · ${opponent} 선방`
        : event.outcome === 'block'
          ? `${actor} 슈팅 · ${opponent} 몸으로 막음`
          : `${actor} 슈팅이 골문을 벗어남`;
  if (event.kind === 'dribble')
    return event.ok ? `${actor} 드리블로 ${opponent} 제침` : `${opponent} 태클 · ${actor} 저지`;
  if (event.ok) return `${actor} → ${receiver} 패스`;
  if (event.lost)
    return event.receiver === undefined
      ? `${opponent} 압박으로 ${actor}의 공을 빼앗음`
      : `${opponent}가 ${actor}의 패스를 가로챔`;
  return `${actor}의 패스가 빗나가 ${receiver}가 수습`;
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
}: {
  playback?: MatchPlayback;
  world: World;
  summary?: boolean;
  onFinish?: (id: string) => void;
  onPlaybackStart?: (id: string) => void;
  onPresentationChange?: (state: { matchId?: string; finished: boolean; details: boolean }) => void;
  /** The primary actions under the charts; without them the pitch offers its own result button. */
  actions?: (controls: PitchControls) => ReactNode;
}) {
  const detailsId = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const last = useRef(0);
  const lastUi = useRef(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [sampleMatchId, setSampleMatchId] = useState(p?.record.id);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [details, setDetails] = useState(false);
  const [reviewedId, setReviewedId] = useState<string>();
  const [selection, setSelection] = useState('0:8');
  const samples = useMemo<Sample[]>(
    () =>
      p?.frames.flatMap((frame, i) =>
        frame.motion?.length
          ? frame.motion.map((motion, j) => ({
              frame: i,
              ball: motion.ball,
              players: motion.players,
              phase: motion.phase,
              ownerId: motion.ownerId,
              step: frame.ballTrack ? i * STEPS_PER_MINUTE + (j + 1) * STEPS_PER_SAMPLE : undefined,
              within: (j + 1) / frame.motion!.length,
            }))
          : [{ frame: i, ball: frame.ball, players: frame.players, within: 1 }],
      ) || [],
    [p],
  );
  // Every recorded ball position of the match, so a fast pass is drawn at its real speed.
  const track = useMemo(() => p?.frames.flatMap((frame) => frame.ballTrack || []) || [], [p]);
  const [selectedSide, selectedIndex] = selection.split(':').map(Number);
  const visibleIndex = sampleMatchId === p?.record.id ? sampleIndex : 0;
  const sample = samples[Math.min(visibleIndex, samples.length - 1)];
  const frame: MatchFrame | undefined = p?.frames[sample?.frame ?? 0];
  const finished = !!p && sampleMatchId === p.record.id && sampleIndex >= samples.length - 1;
  const home = world.clubs.find((c) => c.id === p?.record.home);
  const away = world.clubs.find((c) => c.id === p?.record.away);
  const homeCrest = crestOf(world, home?.id),
    awayCrest = crestOf(world, away?.id);
  const [homeKit, awayKit] = kits(homeCrest, awayCrest);
  const selectedPlayer = p?.squads[selectedSide]?.[selectedIndex];
  const selectedMotion = sample?.players?.[selectedSide]?.[selectedIndex];
  const traits = selectedPlayer ? playerTraits(selectedPlayer) : undefined;
  const latestGoal = p?.record.highlights
    .filter((event) => event.minute <= (frame?.minute ?? 0))
    .at(-1);
  // The duel the pitch is playing out now: the minute's last duels are spread across it.
  const visibleEvents = frame?.events?.slice(-5) || [];
  const currentEvent = visibleEvents.length
    ? visibleEvents[
        Math.min(visibleEvents.length - 1, Math.floor((sample?.within ?? 1) * visibleEvents.length))
      ]
    : undefined;

  useLayoutEffect(() => {
    onPresentationChange?.({ matchId: p?.record.id, finished, details });
  }, [p?.record.id, finished, details, onPresentationChange]);

  useEffect(() => {
    if (finished && p) setReviewedId(p.record.id);
    if (finished && p && samples.length) onFinish?.(p.record.id);
  }, [finished, p?.record.id, samples.length, onFinish]);

  useLayoutEffect(() => {
    clock.current = 0;
    lastUi.current = 0;
    setSampleIndex(0);
    setSampleMatchId(p?.record.id);
    setSelection('0:8');
    setDetails(false);
    setInspect(false);
    setPaused(document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (p) onPlaybackStart?.(p.record.id);
  }, [p?.record.id, onPlaybackStart]);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  useEffect(() => {
    let raf = 0;
    last.current = 0;
    const draw = (time: number) => {
      const elapsed = last.current ? Math.min(60, time - last.current) : 0;
      last.current = time;
      const end = Math.max(0, samples.length - 1);
      if (p && !paused)
        clock.current = Math.min(
          end,
          clock.current + presentationAdvance(elapsed, speed, samples.length, p.frames.length),
        );
      const index = Math.min(end, Math.floor(clock.current));
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
      if (time - lastUi.current > 120 || clock.current === end) {
        setSampleIndex(index);
        lastUi.current = time;
      }
      const current = samples[index];
      const next = samples[Math.min(end, index + 1)] || current;
      const mix = clock.current - index;
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
        ctx.fillStyle = '#174d38';
        ctx.fillRect(0, 0, width, height);
        const pad = width * 0.065;
        const fw = width - pad * 2;
        const fh = height - pad * 2;
        const x = (v: number) => pad + (fw * v) / 100;
        const y = (v: number) => pad + (fh * v) / 100;
        // Mown stripes.
        for (let stripe = 0; stripe < 10; stripe++) {
          ctx.fillStyle = stripe % 2 ? '#1a523c' : '#1d5841';
          ctx.fillRect(pad + (fw * stripe) / 10, pad, fw / 10 + 0.5, fh);
        }
        ctx.strokeStyle = '#a9c6b08c';
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
        if (p && current) {
          const radius = Math.max(6, width * 0.011);
          for (const side of [0, 1]) {
            const kit = side === 0 ? homeKit : awayKit;
            for (let i = 0; i < 11; i++) {
              const motion = current.players?.[side]?.[i];
              const target = next.players?.[side]?.[i];
              const base = initialShape[i];
              const position = motion?.position || [side === 0 ? base[0] : 100 - base[0], base[1]];
              const px = position[0] * (1 - mix) + (target?.position[0] ?? position[0]) * mix;
              const py = position[1] * (1 - mix) + (target?.position[1] ?? position[1]) * mix;
              const selected = inspect && selectedSide === side && selectedIndex === i;
              if (selected && motion) {
                ctx.strokeStyle = '#f2d39b';
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
                ctx.strokeStyle = '#f2d39b';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              ctx.beginPath();
              ctx.arc(x(px), y(py), radius, 0, Math.PI * 2);
              // Goalkeepers wear a contrasting shirt.
              ctx.fillStyle = i === 0 ? (side === 0 ? '#f2c94c' : '#56ccf2') : kit;
              ctx.fill();
              ctx.strokeStyle = '#ffffffcc';
              ctx.lineWidth = 1.2;
              ctx.stroke();
              ctx.fillStyle = inkOn(i === 0 ? (side === 0 ? '#f2c94c' : '#56ccf2') : kit);
              ctx.font = `bold ${Math.max(8, width * 0.012)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(i + 1), x(px), y(py));
            }
          }
          let bx = current.ball[0] * (1 - mix) + next.ball[0] * mix;
          let by = current.ball[1] * (1 - mix) + next.ball[1] * mix;
          if (current.step !== undefined && next.step !== undefined && track.length) {
            const g = current.step + mix * (next.step - current.step) - 1;
            const a = track[Math.max(0, Math.min(track.length - 1, Math.floor(g)))],
              b = track[Math.max(0, Math.min(track.length - 1, Math.ceil(g)))],
              f = g - Math.floor(g);
            bx = a[0] * (1 - f) + b[0] * f;
            by = a[1] * (1 - f) + b[1] * f;
          }
          const ballRadius = Math.max(3.2, width * 0.0065);
          ctx.fillStyle = '#0006';
          ctx.beginPath();
          ctx.ellipse(x(bx) + 1.5, y(by) + 2, ballRadius, ballRadius * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x(bx), y(by), ballRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#21392a';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#d8e4d6';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('킥오프를 기다립니다', width / 2, height / 2);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p, samples, track, paused, speed, homeKit, awayKit, inspect, selectedSide, selectedIndex]);

  const seek = (index: number) => {
    clock.current = Math.max(0, Math.min(samples.length - 1, index));
    setSampleIndex(Math.floor(clock.current));
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
  const playLabel = finished ? '다시 보기' : paused ? '재생' : '일시정지';
  return (
    <div className={`${s.pitch} ${t.pitch}`} data-testid="pitch-theatre">
      <div className={`${s.scoreboard} ${t.scoreboard}`} data-testid="match-score">
        <span className={t.team}>
          {home && <CrestMark crest={homeCrest} size={24} />}
          <b>{home?.name || 'HOME'}</b>
        </span>
        <strong>{frame ? `${frame.score.home} : ${frame.score.away}` : '— : —'}</strong>
        <span className={`${t.team} ${t.awayTeam}`}>
          <b>{away?.name || 'AWAY'}</b>
          {away && <CrestMark crest={awayCrest} size={24} />}
        </span>
      </div>
      <div className={`${s.pitchMeta} ${t.pitchMeta}`}>
        <span className={`${s.live} ${t.liveText}`}>
          {frame
            ? `${frame.minute}′ · ${frame.action}${finished ? ' · 경기 종료' : ''}`
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
                onClick={() => setSpeed(value)}
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
          className={`${s.canvas} ${t.canvas}`}
          onClick={toggle}
        />
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
        {p && !summary && (
          <span className={t.tactics}>
            {tacticLabel[p.record.tactics[0]]} vs {tacticLabel[p.record.tactics[1]]}
          </span>
        )}
      </div>
      <div className={t.latestEvent} data-testid="match-latest-event">
        <span>{frame ? `${frame.minute}′` : '최근 장면'}</span>
        <p>
          {currentEvent && p
            ? describeEvent(currentEvent, p.squads)
            : latestGoal
              ? `${latestGoal.minute}′ ${latestGoal.player} · ${latestGoal.action}`
              : frame
                ? frame.action
                : '다음 경기를 시작하고 우리 선발의 활약을 지켜보세요.'}
        </p>
      </div>
      {p && !summary && frame?.xg && (
        <MatchCharts
          playback={p}
          minute={frame.minute}
          kits={[homeKit, awayKit]}
          crests={[homeCrest, awayCrest]}
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
            record={p.record}
            onSeek={(minute) => {
              seek(minute === 90 ? samples.length - 1 : sampleAtMinute(p.frames, samples, minute));
              setPaused(true);
            }}
          />
        )}
        {p && (summary || finished) && <MatchReport record={p.record} w={world} />}
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
            <span>{frame?.minute || 0}′ / 90′</span>
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
        {inspect && selectedPlayer && selectedMotion && traits && (
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
                    {squad.map((player, i) => (
                      <option key={player.id} value={`${side}:${i}`}>
                        {i + 1}. {player.name} · {player.role}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>
            <p>
              <b>{stateLabels[selectedMotion.state]}</b> · 점선은 이 선수가 선택한 이동 목표입니다.
            </p>
            <div className={s.playerTraits}>
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
