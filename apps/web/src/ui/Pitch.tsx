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
interface Sample {
  frame: number;
  ball: [number, number];
  players?: [PlayerMotion[], PlayerMotion[]];
  phase?: MatchMotionSample['phase'];
  ownerId?: string;
}

const phaseLabels = {
  possession: '볼 운반',
  transition: '공수 전환',
  pass: '패스 진행',
  shot: '슈팅',
  restart: '경기 재개',
};

export function Pitch({
  playback: p,
  world,
  summary = false,
  onFinish,
  onPlaybackStart,
  onPresentationChange,
  afterControls,
}: {
  playback?: MatchPlayback;
  world: World;
  summary?: boolean;
  onFinish?: (id: string) => void;
  onPlaybackStart?: (id: string) => void;
  onPresentationChange?: (state: { matchId?: string; finished: boolean; details: boolean }) => void;
  afterControls?: ReactNode;
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
          ? frame.motion.map((motion) => ({
              frame: i,
              ball: motion.ball,
              players: motion.players,
              phase: motion.phase,
              ownerId: motion.ownerId,
            }))
          : [{ frame: i, ball: frame.ball, players: frame.players }],
      ) || [],
    [p],
  );
  const [selectedSide, selectedIndex] = selection.split(':').map(Number);
  const visibleIndex = sampleMatchId === p?.record.id ? sampleIndex : 0;
  const sample = samples[Math.min(visibleIndex, samples.length - 1)];
  const frame: MatchFrame | undefined = p?.frames[sample?.frame ?? 0];
  const finished = !!p && sampleMatchId === p.record.id && sampleIndex >= samples.length - 1;
  const home = world.clubs.find((c) => c.id === p?.record.home);
  const away = world.clubs.find((c) => c.id === p?.record.away);
  const selectedPlayer = p?.squads[selectedSide]?.[selectedIndex];
  const selectedMotion = sample?.players?.[selectedSide]?.[selectedIndex];
  const traits = selectedPlayer ? playerTraits(selectedPlayer) : undefined;
  const latest = p?.record.highlights
    .filter((event) => event.minute <= (frame?.minute ?? 0))
    .at(-1);

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
      if (time - lastUi.current > 120 || clock.current === end) {
        setSampleIndex(index);
        lastUi.current = time;
      }
      const current = samples[index];
      const next = samples[Math.min(end, index + 1)] || current;
      const mix = clock.current - index;
      const element = canvas.current;
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
        ctx.fillStyle = '#1c543e';
        ctx.fillRect(pad, pad, fw, fh);
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
        }
        if (p && current) {
          for (const side of [0, 1]) {
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
              const radius = Math.max(6, width * 0.011);
              if (selected) {
                ctx.beginPath();
                ctx.arc(x(px), y(py), radius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = '#f2d39b';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
              ctx.beginPath();
              ctx.arc(x(px), y(py), radius, 0, Math.PI * 2);
              ctx.fillStyle = side === 0 ? home?.color || '#c77e5b' : '#eadcc3';
              ctx.fill();
              ctx.strokeStyle = '#ffffffbb';
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.fillStyle = '#132a20';
              ctx.font = `bold ${Math.max(8, width * 0.012)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(i + 1), x(px), y(py));
            }
          }
          const bx = current.ball[0] * (1 - mix) + next.ball[0] * mix;
          const by = current.ball[1] * (1 - mix) + next.ball[1] * mix;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x(bx), y(by), Math.max(3, width * 0.006), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#21392a';
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
  }, [p, samples, paused, speed, home?.color, inspect, selectedSide, selectedIndex]);

  const seek = (index: number) => {
    clock.current = Math.max(0, Math.min(samples.length - 1, index));
    setSampleIndex(Math.floor(clock.current));
    if (p && index < samples.length - 1) onPlaybackStart?.(p.record.id);
  };
  return (
    <div className={`${s.pitch} ${t.pitch}`} data-testid="pitch-theatre">
      <div className={`${s.scoreboard} ${t.scoreboard}`} data-testid="match-score">
        <span>{home?.name || 'HOME'}</span>
        <strong>{frame ? `${frame.score.home} : ${frame.score.away}` : '— : —'}</strong>
        <span>{away?.name || 'AWAY'}</span>
      </div>
      <div className={`${s.pitchMeta} ${t.pitchMeta}`}>
        <span className={s.live}>
          {frame
            ? `${frame.minute}′ · ${frame.action}${finished ? ' · 경기 종료' : ''}`
            : 'MATCH DAY'}
        </span>
        <span className={t.tactics}>
          {summary
            ? '지난 경기 · 기록된 골과 최종 통계'
            : p
              ? `${tacticLabel[p.record.tactics[0]]} vs ${tacticLabel[p.record.tactics[1]]}`
              : '다음 경기를 선택하면 관전이 시작됩니다'}
        </span>
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
      <canvas
        ref={canvas}
        aria-label="22명의 선수와 공으로 표현하는 경기"
        className={`${s.canvas} ${t.canvas}`}
      />
      <div className={t.latestEvent} data-testid="match-latest-event">
        <span>최근 장면</span>
        <p>
          {latest
            ? `${latest.minute}′ ${latest.player} · ${latest.action}`
            : frame
              ? `${frame.minute}′ ${frame.action}`
              : '다음 경기를 시작하고 우리 선발의 활약을 지켜보세요.'}
        </p>
      </div>
      <div className={`${s.playControls} ${t.playControls}`}>
        <button
          onClick={() => {
            if (finished) seek(0);
            setPaused(finished ? false : !paused);
          }}
          disabled={!p}
        >
          {finished ? '다시 보기' : paused ? '재생' : '일시정지'}
        </button>
        <label className={t.speed}>
          <span>관전 속도</span>
          <select
            aria-label="관전 속도"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {WATCH_SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            seek(samples.length - 1);
            setPaused(true);
          }}
          disabled={!p}
        >
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
      {afterControls}
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
              <select value={selection} onChange={(e) => setSelection(e.target.value)}>
                {p?.squads.map((squad, side) => (
                  <optgroup key={side} label={side === 0 ? home?.name : away?.name}>
                    {squad.map((player, i) => (
                      <option key={player.id} value={`${side}:${i}`}>
                        {i + 1}. {player.name} · {player.role}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
                ['슈팅', frame.metrics[0][4], frame.metrics[1][4]],
                ['유효 슈팅', frame.metrics[0][5], frame.metrics[1][5]],
                [
                  '패스 성공',
                  percent(frame.metrics[0][3], frame.metrics[0][2]),
                  percent(frame.metrics[1][3], frame.metrics[1][2]),
                ],
                ['태클', frame.metrics[0][6], frame.metrics[1][6]],
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
