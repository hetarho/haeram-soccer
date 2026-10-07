import { useState, type FormEvent } from 'react';
import type { CountryCode } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { ClientState, GameClient } from '../runtime/client';
import s from './ClubFounding.module.css';

export function ClubFounding({
  client,
  state,
  replace = false,
  onDone,
}: {
  client: GameClient;
  state: ClientState;
  replace?: boolean;
  onDone?: () => void;
}) {
  const [code, setCode] = useState<CountryCode>('ENG'),
    [name, setName] = useState('Haeram Athletic'),
    [difficulty, setDifficulty] = useState(2),
    [color, setColor] = useState('#bf7956'),
    [seed, setSeed] = useState(() => crypto.randomUUID().slice(0, 18));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void client
      .found({ country: code, name: name.trim(), difficulty, color, seed }, replace)
      .then((reply) => {
        if (reply?.ok) onDone?.();
      });
  };
  return (
    <section className={s.start} data-testid="club-founding" aria-label="새 클럽 시작">
      <header>
        <span>HAERAM · CLUB SIM</span>
        <h2>작은 클럽의, 큰 내일.</h2>
        <p>선수와 구장을 키우고, 나만의 빌드로 더 높은 무대에 도전해요.</p>
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
          창단 국가
          <select
            aria-label="창단 국가"
            value={code}
            onChange={(event) => setCode(event.target.value as CountryCode)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.groups.length}부 출발
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>첫 자금</legend>
          <div className={s.capital}>
            {(
              [
                [2, '넉넉한 출발', '추천 · 운영비 2배'],
                [1, '표준 출발', '운영비 1배'],
                [0.5, '작은 출발', '운영비 0.5배'],
              ] as const
            ).map(([value, title, note]) => (
              <button
                key={value}
                type="button"
                aria-pressed={difficulty === value}
                onClick={() => setDifficulty(value)}
              >
                <b>{title}</b>
                <small>{note}</small>
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
            <p>같은 시드는 같은 선수와 상대를 만들어요. 첫 자금만 난이도에 따라 달라집니다.</p>
          </div>
        </details>
        <div className={s.origin}>
          <span>
            {country(code).name} · {country(code).groups.length}부 · 1901년
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
