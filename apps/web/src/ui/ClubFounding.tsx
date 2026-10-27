import { FOUNDING_YEAR } from '../../../../packages/engine/src/calendar';
import { BUILD_PRESETS } from '../../../../packages/engine/src/preset-data';
import { createIdentityDraft } from '../../../../packages/engine/src/club-identity';
import { Select } from './Select';
import { lazy, Suspense, useState, type FormEvent } from 'react';
import type { CountryCode, DifficultyLevel } from '../../../../packages/contracts/src/types';
import type { ClubIdentity } from '../../../../packages/contracts/src/identity';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { ClientState, GameClient } from '../runtime/client';
import { CrestMark } from './ClubCrest';
import { linkedIdentityColours } from './clubIdentityDraft';
import { Dialog } from './Dialog';
import s from './ClubFounding.module.css';
import { useLocale } from '../presentation/react';
import presentationStyle from './PresentationSettings.module.css';

/** The editor and its pitch preview load only when 꾸미기 opens them (WEB-86/87). */
const ClubIdentityEditor = lazy(() =>
  import('./ClubIdentityEditor').then((module) => ({ default: module.ClubIdentityEditor })),
);
/** The representative main colour a new club's design starts from. */
const FIRST_COLOUR = '#bf7956';

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
  const { t } = useLocale();
  const [code, setCode] = useState<CountryCode>('ENG'),
    [name, setName] = useState('Haeram Athletic'),
    [level, setLevel] = useState<DifficultyLevel>('easy'),
    [seed, setSeed] = useState(() => crypto.randomUUID().slice(0, 18)),
    // 기본 방향 shows selected; a preset founds the club with its whole direction (→WEB-15).
    [preset, setPreset] = useState('default'),
    // KIT-14: the club design is drafted once per founding session. Later seed or country changes
    // never reroll it; it lives until this session (this slot's founding) is left.
    [design, setDesign] = useState(() =>
      linkedIdentityColours(createIdentityDraft({ country: code, seed, color: FIRST_COLOUR })),
    ),
    // The editor's working copy while 꾸미기 is open. The session design stays its entry: 사용
    // takes the copy, 취소 or closing the editor drops it (WEB-86).
    [editing, setEditing] = useState<ClubIdentity | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void client
      .found(
        {
          country: code,
          name: name.trim(),
          level,
          // The club's colour is the design's representative main colour (→KIT-4).
          color: design.colours[0],
          seed,
          ...(preset !== 'default' ? { preset } : {}),
          // Exactly the previewed design; the worker draws no other colour or crest (→KIT-14).
          identity: design,
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
        <div className={`${s.slotBar} ${presentationStyle.startBar}`}>
          <span>{t('founding.slot', { slot: slot + 1 })}</span>
          {onBack && (
            <button type="button" onClick={onBack}>
              {t('founding.backToSlots')}
            </button>
          )}
        </div>
        <h2>당신의 클럽, 첫 시즌.</h2>
        <p>선수와 구장을 키우고, 우리만의 방향으로 더 높은 무대에 도전해요.</p>
      </header>
      <div className={s.loop} aria-label="클럽 성장 흐름" data-surface="tile">
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
              세계 생성 시드
              <input
                maxLength={80}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                autoComplete="off"
              />
            </label>
            <p>
              같은 시드는 같은 세계를 만들어요. 시드를 바꿔도 고른 구단 디자인은 그대로예요.
              난이도는 첫 자금과 창단 선수단만 바꿉니다.
            </p>
          </div>
        </details>
        <div className={s.origin}>
          <span>
            {country(code).name} 아마추어 리그 · {FOUNDING_YEAR}년 창단
          </span>
          <small>계정 없이 이 브라우저에 저장돼요. 기록을 파일로 보관할 수 있어요.</small>
        </div>
        {/* The current crest and its 꾸미기 entry share the create row, so the basic screen still
            fits (→WEB-15). */}
        <div className={s.launch} data-ui="launch">
          <button
            type="button"
            className={s.design}
            aria-label="구단 디자인 꾸미기"
            onClick={() => setEditing(design)}
          >
            <CrestMark crest={design.crest} size={30} />
            <span>꾸미기</span>
          </button>
          <button
            data-ui="primary"
            className={s.play}
            type="submit"
            disabled={state.busy || state.readonly || (!replace && !!state.error) || !name.trim()}
          >
            {state.busy ? '클럽을 준비하는 중…' : '클럽 창단 →'}
          </button>
        </div>
      </form>
      {editing && (
        <Dialog
          label="구단 디자인"
          wide
          onClose={() => setEditing(null)}
          actions={
            <div className={s.designActions}>
              <button type="button" onClick={() => setEditing(null)}>
                취소
              </button>
              <button
                data-ui="primary"
                type="button"
                className={s.use}
                disabled={state.readonly}
                onClick={() => {
                  setDesign(editing);
                  setEditing(null);
                }}
              >
                이 디자인 사용
              </button>
            </div>
          }
        >
          <p className={s.designNote}>
            이 디자인 사용을 누르면 창단할 때 그대로 써요. 취소하거나 창을 닫으면 꾸미기를 열기 전
            디자인으로 돌아가요.
          </p>
          <Suspense fallback={<p role="status">디자인 도구를 불러오는 중…</p>}>
            <ClubIdentityEditor value={editing} onChange={setEditing} readonly={state.readonly} />
          </Suspense>
        </Dialog>
      )}
    </section>
  );
}
