import { useEffect, useRef, useState } from 'react';
import type { MatchPlayback, MatchFrame, World } from '../../../../packages/contracts/src/types';
import { percent } from './format';
import s from './App.module.css';
export function Pitch({ playback, world }: { playback?: MatchPlayback; world: World }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0),
    last = useRef(0);
  const [minute, setMinute] = useState(0),
    [speed, setSpeed] = useState(1),
    [paused, setPaused] = useState(false);
  const p = playback;
  useEffect(() => {
    clock.current = 0;
    setMinute(0);
    setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, [p?.record.id]);
  useEffect(() => {
    let raf = 0;
    last.current = 0;
    const draw = (time: number) => {
      const elapsed = last.current ? Math.min(60, time - last.current) : 0;
      last.current = time;
      if (p && !paused)
        clock.current = Math.min(p.frames.length - 1, clock.current + (elapsed * speed) / 200);
      const index = Math.floor(clock.current),
        frame = p?.frames[index],
        previous = p?.frames[Math.max(0, index - 1)];
      setMinute(index);
      const element = canvas.current,
        ctx = element?.getContext('2d');
      if (element && ctx) {
        const width = element.clientWidth,
          height = width / 1.65,
          dpr = Math.min(2, window.devicePixelRatio || 1);
        if (element.width !== Math.round(width * dpr)) {
          element.width = Math.round(width * dpr);
          element.height = Math.round(height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#174d38';
        ctx.fillRect(0, 0, width, height);
        const pad = width * 0.065,
          fw = width - pad * 2,
          fh = height - pad * 2;
        const x = (v: number) => pad + (fw * v) / 100,
          y = (v: number) => pad + (fh * v) / 100;
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i % 2 ? '#1c543e' : '#205a42';
          ctx.fillRect(x(i * 10), pad, fw / 10, fh);
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
          const left = side === 0 ? 0 : 82;
          ctx.strokeRect(x(left), y(22), fw * 0.18, fh * 0.56);
          ctx.strokeRect(x(side === 0 ? 0 : 94), y(38), fw * 0.06, fh * 0.24);
        }
        if (p && frame) {
          const rows = [
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
          const mix = clock.current - index;
          const ball = [0, 1].map(
            (i) => (previous?.ball[i] ?? frame.ball[i]) * (1 - mix) + frame.ball[i] * mix,
          );
          for (const side of [0, 1])
            for (let i = 0; i < 11; i++) {
              const pos = rows[i],
                px =
                  (side === 0 ? pos[0] : 100 - pos[0]) +
                  Math.sin(clock.current * 0.8 + i * 2) * 2 +
                  (ball[0] - 50) * 0.09,
                py = pos[1] + Math.cos(clock.current * 0.7 + i) * 2;
              ctx.beginPath();
              ctx.arc(x(px), y(py), Math.max(7, width * 0.011), 0, Math.PI * 2);
              ctx.fillStyle =
                side === 0
                  ? world.clubs.find((c) => c.id === p.record.home)?.color || '#e4935d'
                  : '#eadcc3';
              ctx.fill();
              ctx.strokeStyle = '#ffffffbb';
              ctx.stroke();
              ctx.fillStyle = side === 0 ? '#fff' : '#173d2d';
              ctx.font = `bold ${Math.max(8, width * 0.012)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(i + 1), x(px), y(py));
            }
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x(ball[0]), y(ball[1]), width * 0.006, 0, Math.PI * 2);
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
  }, [p, paused, speed, world.clubs]);
  const frame: MatchFrame | undefined = p?.frames[minute];
  const home = world.clubs.find((c) => c.id === p?.record.home),
    away = world.clubs.find((c) => c.id === p?.record.away);
  return (
    <div className={s.pitch}>
      <div className={s.scoreboard}>
        <span>{home?.name || 'HOME'}</span>
        <strong>{frame ? `${frame.score.home} : ${frame.score.away}` : '— : —'}</strong>
        <span>{away?.name || 'AWAY'}</span>
      </div>
      <div className={s.pitchMeta}>
        <span className={s.live}>{frame ? `${frame.minute}′ · ${frame.action}` : 'MATCH DAY'}</span>
        <span>간소화된 관전 · 확정 결과 재생</span>
      </div>
      <canvas
        ref={canvas}
        aria-label="22명의 선수와 공으로 표현하는 간소화된 경기"
        className={s.canvas}
      />
      <div className={s.playControls}>
        <button onClick={() => setPaused(!paused)} disabled={!p}>
          {paused ? '재생' : '일시정지'}
        </button>
        <label>
          재생 속도{' '}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={1}>1×</option>
            <option value={4}>4×</option>
            <option value={12}>12×</option>
          </select>
        </label>
        <button
          onClick={() => {
            clock.current = 89;
            setMinute(89);
            setPaused(true);
          }}
          disabled={!p}
        >
          결과 보기
        </button>
      </div>
      {frame && (
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
  );
}
