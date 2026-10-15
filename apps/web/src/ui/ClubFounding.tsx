import { FOUNDING_YEAR } from '../../../../packages/engine/src/world';
import { BUILD_PRESETS } from '../../../../packages/engine/src/preset-data';
import { Select } from './Select';
import { useState, type FormEvent } from 'react';
import type { CountryCode, DifficultyLevel } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { ClientState, GameClient } from '../runtime/client';
import s from './ClubFounding.module.css';

export function ClubFounding({
  client,
  state,
  replace = false,
  slot = 0,
  onBack,
  onDone,
}: {
  client: GameClient;
  state: ClientState;
  replace?: boolean;
  /** The game slot this club goes into (→WEB-62). */
  slot?: number;
  /** Back to the slot screen when another slot holds a game. */
  onBack?: () => void;
  onDone?: () => void;
}) {
  const [code, setCode] = useState<CountryCode>('ENG'),
    [name, setName] = useState('Haeram Athletic'),
    [level, setLevel] = useState<DifficultyLevel>('easy'),
    [color, setColor] = useState('#bf7956'),
    [seed, setSeed] = useState(() => crypto.randomUUID().slice(0, 18)),
    // 기본 방향 shows selected; a preset founds the club with its whole direction (→WEB-15).
    [preset, setPreset] = useState('default');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void client
      .found(
        {
          country: code,
          name: name.trim(),
          level,
          color,
          seed,
          ...(preset !== 'default' ? { preset } : {}),
        },
        replace,
      )
      .then((reply) => {
        if (reply?.ok) onDone?.();
      });
  };
  return (
    <section className={s.start} data-testid="club-founding" aria-label="새 게임">
      <header>
        <div className={s.slotBar}>
          <span>HAERAM · 슬롯 {slot + 1} · 새 게임</span>
          {onBack && (
            <button type="button" onClick={onBack}>
              ← 게임 슬롯
            </button>
          )}
        </div>
        <h2>당신의 클럽, 첫 시즌.</h2>
        <p>선수와 구장을 키우고, 우리만의 방향으로 더 높은 무대에 도전해요.</p>
      </header>
      <div className={s.loop} aria-label="클럽 성장 흐름">
        <span>
          <b>01</b> 준비
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <b>02</b> 경기
        </span>
        <i aria-hidden="true">→</i>
        <span>
          <b>03</b> 성장
        </span>
      </div>
      <form onSubmit={submit}>
        <div className={s.pair}>
          <label>
            클럽 이름
            <input
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            구단 운영
            <Select
              aria-label="구단 운영"
              value={preset}
              onValueChange={(value) => setPreset(value)}
            >
              <option
                value="default"
                data-hint="모든 줄이 표준 · 창단 뒤 운영 방침에서 언제든 바꿔요"
              >
                기본 방향
              </option>
              {BUILD_PRESETS.map((item) => (
                <option key={item.id} value={item.id} data-hint={`${item.model} · ${item.summary}`}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label>
          창단 국가
          <Select
            aria-label="창단 국가"
            value={code}
            onValueChange={(value) => setCode(value as CountryCode)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.groups.length}부 출발
              </option>
            ))}
          </Select>
        </label>
        <fieldset>
          <legend>난이도</legend>
          <div className={s.capital}>
            {(
              [
                ['easy', '쉬움', '자금 2배', '리그 평균'],
                ['normal', '보통', '자금 1배', '선발 −2'],
                ['hard', '어려움', '자금 0.5배', '선발 −4'],
                ['extreme', '최상', '자금 0.25배', '선발 −6'],
              ] as const
            ).map(([value, title, cash, squad]) => (
              <button
                key={value}
                type="button"
                aria-pressed={level === value}
                aria-label={`${title} · ${cash} · ${squad}`}
                onClick={() => setLevel(value)}
              >
                <b>{title}</b>
                <small>{cash}</small>
                <small>{squad}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <details className={s.advanced}>
          <summary>고급 설정</summary>
          <div>
            <label>
              클럽 색상
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </label>
            <label>
              세계 생성 시드
              <input
                maxLength={80}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                autoComplete="off"
              />
            </label>
            <p>같은 시드는 같은 세계를 만들어요. 난이도는 첫 자금과 창단 선수단만 바꿉니다.</p>
          </div>
        </details>
        <div className={s.origin}>
          <span>
            {country(code).name} 아마추어 리그 · {FOUNDING_YEAR}년 창단
          </span>
          <small>계정 없이 이 브라우저에 저장돼요. 기록을 파일로 보관할 수 있어요.</small>
        </div>
        <button
          className={s.play}
          type="submit"
          disabled={state.busy || state.readonly || (!replace && !!state.error) || !name.trim()}
        >
          {state.busy ? '클럽을 준비하는 중…' : '클럽 창단 →'}
        </button>
      </form>
    </section>
  );
}
