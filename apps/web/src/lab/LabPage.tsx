/**
 * The match lab (→LAB-1…10): two generated sides, the engine's tunable numbers, one match watched in
 * the game's own match view (→LAB-9), runs in the lab's workers and each run against a pinned
 * baseline. Imports the catalog, protocol types, its own state and the game's match view; the lab's
 * matches play in the workers (ARCH-4, the lab's constraints).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Catalog, CatalogLeaf } from '../../../../scripts/lab-tunables';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import type { MatchPlayback, Tactic, World } from '../../../../packages/contracts/src/types';
import { Pitch } from '../ui/Pitch';
import catalogJson from './tunables.json';
import { LabPool, type LabRun } from './pool';
import type { LabSide, LabSideIndex } from './protocol';
import type { Estimate, RunSummary, SideRow, TargetRow } from './summary';
import {
  compare,
  defaultLabState,
  dropRun,
  exportOverrides,
  importOverrides,
  keepRun,
  LAB_RANGES,
  LAB_TACTICS,
  loadLabState,
  newSeed,
  RUN_COUNTS,
  saveLabState,
  setOverride,
  starterAverage,
  STARTERS,
  type Comparison,
  type KeptRun,
  type LabState,
  type SideSettings,
} from './state';
import styles from './LabPage.module.css';

const catalog = catalogJson as Catalog;
const LEAVES = catalog.groups.flatMap((g) => g.leaves);
const SIDE_NAMES = ['좌측 팀', '우측 팀'] as const;
/**
 * Groups the page's own match view reads (Pitch and its figure code import MATCH_MOTION_CONFIG):
 * an override reaches the worker's match and frames, but the view draws with the code's values.
 */
const PAGE_READ_GROUPS: ReadonlySet<string> = new Set(['MATCH_MOTION_CONFIG']);
const SKIP_REASON = {
  unknown: '없는 경로',
  'not-a-number': '숫자가 아님',
  'load-time': '불러올 때 읽는 값',
} as const;

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

function fmt(value: number | null | undefined, unit = 'count') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const text = value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  if (unit === 'percent') return `${text}%`;
  if (unit === 'minutes') return `${text}분`;
  if (unit === 'metres') return `${text} m`;
  return text;
}
const signed = (value: number, unit?: string) => (value > 0 ? '+' : '') + fmt(value, unit);
const half = (e: Estimate) =>
  Number.isFinite(e.interval[0]) && Number.isFinite(e.interval[1])
    ? (e.interval[1] - e.interval[0]) / 2
    : Number.NaN;

/** A number input that commits on blur or Enter, so a half-typed value never reaches the state. */
function NumberField(props: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { label, value, onCommit, min, max, disabled, className } = props;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return setDraft(String(value));
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(String(bounded));
    if (bounded !== value) onCommit(bounded);
  };
  return (
    <input
      className={cx(styles.number, className)}
      aria-label={label}
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function SidePanel(props: {
  index: LabSideIndex;
  settings: SideSettings;
  side?: LabSide;
  busy: boolean;
  onSettings: (change: Partial<SideSettings>) => void;
  onGenerate: () => void;
  onOvr: (player: number, ovr: number) => void;
}) {
  const { index, settings, side, busy, onSettings, onGenerate, onOvr } = props;
  const name = SIDE_NAMES[index];
  const ovrs = side?.ovrs ?? [];
  return (
    <section className={styles.side} aria-label={name}>
      <h3>{name}</h3>
      <div className={styles.fields}>
        <label>
          전술
          <select
            aria-label={`${name} 전술`}
            value={settings.tactic}
            onChange={(e) => onSettings({ tactic: e.target.value as Tactic })}
          >
            {LAB_TACTICS.map((t) => (
              <option key={t} value={t}>
                {tacticLabel[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          평균 OVR
          <NumberField
            label={`${name} 평균 OVR`}
            value={settings.average}
            min={LAB_RANGES.average[0]}
            max={LAB_RANGES.average[1]}
            onCommit={(v) => onSettings({ average: Math.round(v) })}
          />
        </label>
        <label>
          편차
          <NumberField
            label={`${name} 편차`}
            value={settings.spread}
            min={LAB_RANGES.spread[0]}
            max={LAB_RANGES.spread[1]}
            onCommit={(v) => onSettings({ spread: Math.round(v) })}
          />
        </label>
        <label>
          시드
          <input
            className={styles.seed}
            aria-label={`${name} 시드`}
            value={settings.seed}
            onChange={(e) => onSettings({ seed: e.target.value })}
          />
        </label>
        <button type="button" onClick={() => onSettings({ seed: newSeed() })}>
          새로 뽑기
        </button>
        <button type="button" className={styles.primary} onClick={onGenerate} disabled={busy}>
          {busy ? '생성 중…' : '생성'}
        </button>
      </div>
      <p className={styles.average}>
        선발 평균 OVR <strong>{ovrs.length ? fmt(starterAverage(ovrs)) : '–'}</strong>
        {side && ` · ${tacticLabel[side.tactic]} · 시드 ${side.seed}`}
      </p>
      {side && (
        <table className={styles.squad}>
          <thead>
            <tr>
              <th>#</th>
              <th>자리</th>
              <th>이름</th>
              <th>OVR</th>
              <th>구분</th>
            </tr>
          </thead>
          <tbody>
            {side.players.map((p, i) => (
              <tr key={p.id} className={cx(i === STARTERS && styles.benchStart)}>
                <td>{i + 1}</td>
                <td>{p.position}</td>
                <td>{p.name}</td>
                <td>
                  <NumberField
                    label={`${name} ${i + 1}번 OVR`}
                    value={side.ovrs[i]!}
                    min={LAB_RANGES.ovr[0]}
                    max={LAB_RANGES.ovr[1]}
                    onCommit={(v) => onOvr(i, Math.round(v))}
                  />
                </td>
                <td>{i < STARTERS ? '선발' : '교체'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ValuesPanel(props: {
  overrides: Record<string, number>;
  reads?: ReadonlySet<string>;
  onChange: (overrides: Record<string, number>) => void;
}) {
  const { overrides, reads, onChange } = props;
  const [query, setQuery] = useState('');
  const [showUnread, setShowUnread] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [transfer, setTransfer] = useState('');
  const [note, setNote] = useState<string>();
  const q = query.trim().toLowerCase();
  const changed = Object.keys(overrides).length;
  const visible = (leaf: CatalogLeaf) =>
    (!reads || showUnread || reads.has(leaf.path) || leaf.path in overrides) &&
    (!q || leaf.path.toLowerCase().includes(q) || leaf.comment.toLowerCase().includes(q));
  const unread = reads ? LEAVES.filter((l) => !reads.has(l.path)).length : 0;
  const reset = (paths: string[]) => {
    const next = { ...overrides };
    for (const path of paths) delete next[path];
    onChange(next);
  };
  const copy = () => {
    const text = exportOverrides(overrides);
    setTransfer(text);
    void navigator.clipboard?.writeText(text).then(
      () => setNote(`변경값 ${changed}개를 복사했습니다`),
      () => setNote('복사하지 못했습니다. 아래 칸의 JSON을 직접 복사하세요'),
    );
  };
  const paste = () => {
    const result = importOverrides(transfer, LEAVES);
    if (!result.ok) return setNote(result.message);
    onChange({ ...overrides, ...result.overrides });
    const applied = Object.keys(result.overrides).length;
    setNote(
      `${applied}개 적용` +
        (result.skipped.length
          ? ` · 건너뜀: ${result.skipped.map((s) => `${s.path} (${SKIP_REASON[s.reason]})`).join(', ')}`
          : ''),
    );
  };
  return (
    <section className={styles.panel} aria-labelledby="lab-values">
      <div className={styles.panelHead}>
        <h2 id="lab-values">엔진 수치</h2>
        <span className={styles.muted}>변경 {changed}개</span>
        <button type="button" onClick={() => onChange({})} disabled={!changed}>
          전체 초기화
        </button>
      </div>
      <div className={styles.fields}>
        <input
          className={styles.search}
          type="search"
          aria-label="수치 검색"
          placeholder="경로나 설명으로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {reads && unread > 0 && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showUnread}
              onChange={(e) => setShowUnread(e.target.checked)}
            />
            이 리비전에서 안 읽는 값 보기 ({unread}개)
          </label>
        )}
      </div>
      <div className={styles.groups}>
        {catalog.groups.map((group) => {
          const leaves = group.leaves.filter(visible);
          if (!leaves.length) return null;
          const groupChanged = group.leaves.filter((l) => l.path in overrides);
          const isOpen = !!q || open.has(group.name);
          return (
            <div key={group.name} className={styles.group}>
              <div className={styles.groupHead}>
                <button
                  type="button"
                  className={styles.groupToggle}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(group.name)) next.add(group.name);
                      return next;
                    })
                  }
                >
                  <code>{group.name}</code>
                  <span className={styles.muted}>
                    {leaves.length}개{groupChanged.length ? ` · 변경 ${groupChanged.length}` : ''}
                  </span>
                  {PAGE_READ_GROUPS.has(group.name) && (
                    <span
                      className={styles.badge}
                      title="경기와 프레임 계산에는 쓰이지만, 관전 화면이 직접 읽는 값은 코드 값 그대로입니다."
                    >
                      관전 화면에는 적용 안 됨
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => reset(groupChanged.map((l) => l.path))}
                  disabled={!groupChanged.length}
                >
                  그룹 초기화
                </button>
              </div>
              {isOpen && (
                <ul className={styles.leaves}>
                  {leaves.map((leaf) => {
                    const current = overrides[leaf.path] ?? leaf.value;
                    const isChanged = leaf.path in overrides;
                    return (
                      <li key={leaf.path} className={cx(styles.leaf, isChanged && styles.changed)}>
                        <div className={styles.leafHead}>
                          <code>{leaf.path}</code>
                          {isChanged && <span className={styles.badge}>변경</span>}
                        </div>
                        {leaf.comment && (
                          <p className={styles.comment} title={leaf.comment}>
                            {leaf.comment}
                          </p>
                        )}
                        <div className={styles.leafValues}>
                          <span className={styles.muted}>기본 {leaf.value}</span>
                          <NumberField
                            label={leaf.path}
                            value={current}
                            disabled={leaf.loadTime}
                            onCommit={(v) => onChange(setOverride(overrides, leaf, v))}
                          />
                          <button
                            type="button"
                            onClick={() => reset([leaf.path])}
                            disabled={!isChanged}
                          >
                            초기화
                          </button>
                        </div>
                        {leaf.loadTime && (
                          <p className={styles.muted}>
                            엔진을 불러올 때 한 번 읽는 값이라 실험실에서 바꿀 수 없습니다.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.transfer}>
        <div className={styles.fields}>
          <button type="button" onClick={copy} disabled={!changed}>
            변경값 복사
          </button>
          <button type="button" onClick={paste} disabled={!transfer.trim()}>
            붙여넣기
          </button>
        </div>
        <textarea
          aria-label="변경값 JSON"
          placeholder='{"SHOT_CONFIG.saveShare": 0.4}'
          value={transfer}
          onChange={(e) => setTransfer(e.target.value)}
          rows={4}
        />
        {note && <p role="status">{note}</p>}
      </div>
    </section>
  );
}

function Measured(props: { estimate?: Estimate; unit?: string }) {
  const { estimate, unit } = props;
  if (!estimate) return <>–</>;
  const h = half(estimate);
  return (
    <>
      {fmt(estimate.value, unit)}
      {Number.isFinite(h) && h > 0 && <small> ± {fmt(h, unit)}</small>}
    </>
  );
}

function Difference(props: { cmp?: Comparison; unit?: string }) {
  const { cmp, unit } = props;
  if (!cmp) return <>–</>;
  return (
    <span
      className={cx(cmp.marked && styles.marked)}
      title={cmp.marked ? '두 실행의 95% 구간이 겹치지 않습니다' : undefined}
    >
      {signed(cmp.difference, unit)}
      {cmp.marked && ' ●'}
    </span>
  );
}

function TargetTable(props: { rows: TargetRow[]; baseline?: TargetRow[] }) {
  const { rows, baseline } = props;
  return (
    <table className={styles.table}>
      <caption>MATCH-23 목표 (팀·경기당, 양 팀 평균)</caption>
      <thead>
        <tr>
          <th>항목</th>
          <th>실제 범위</th>
          <th>값 (95% 구간)</th>
          <th>판정</th>
          {baseline && (
            <>
              <th>기준</th>
              <th>차이</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const base = baseline?.find((b) => b.id === row.id);
          const cmp = compare(row.estimate, base?.estimate);
          return (
            <tr key={row.id}>
              <th scope="row">
                {row.label}
                <small className={styles.muted}> {row.id}</small>
              </th>
              <td>
                {fmt(row.real[0], row.unit)}–{fmt(row.real[1], row.unit)}
                <small className={styles.muted}>
                  {' '}
                  (허용 {fmt(row.band[0], row.unit)}–{fmt(row.band[1], row.unit)})
                </small>
              </td>
              <td>
                <Measured estimate={row.estimate} unit={row.unit} />
              </td>
              <td className={cx(row.pass === false && styles.fail)}>
                {row.pass === undefined ? '측정 없음' : row.pass ? '통과' : '벗어남'}
              </td>
              {baseline && (
                <>
                  <td>
                    <Measured estimate={base?.estimate} unit={row.unit} />
                  </td>
                  <td>
                    <Difference cmp={cmp} unit={row.unit} />
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SideCell(props: { row: SideRow; side: 'left' | 'right'; baseline?: SideRow }) {
  const { row, side, baseline } = props;
  const cmp = compare(row[side], baseline?.[side]);
  return (
    <td>
      <Measured estimate={row[side]} unit={row.unit} />
      {baseline && (
        <div className={styles.muted}>
          기준 {fmt(baseline[side].value, row.unit)} · <Difference cmp={cmp} unit={row.unit} />
        </div>
      )}
    </td>
  );
}

function SideTable(props: { rows: SideRow[]; baseline?: SideRow[] }) {
  const { rows, baseline } = props;
  return (
    <table className={styles.table}>
      <caption>팀별 기록 (경기당)</caption>
      <thead>
        <tr>
          <th>항목</th>
          <th>좌측 팀</th>
          <th>우측 팀</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const base = baseline?.find((b) => b.id === row.id);
          return (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <SideCell row={row} side="left" baseline={base} />
              <SideCell row={row} side="right" baseline={base} />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const CARD = { yellow: '경고', secondYellow: '경고 누적 퇴장', red: '퇴장' } as const;

function Results(props: { run: KeptRun; baseline?: KeptRun }) {
  const { run, baseline } = props;
  const s: RunSummary = run.summary;
  const b = baseline?.summary;
  const { outcome } = s;
  return (
    <section className={styles.panel} aria-labelledby="lab-results">
      <div className={styles.panelHead}>
        <h2 id="lab-results">결과</h2>
        <span className={styles.muted}>
          {s.matches}경기 · 실행 시드 {run.runSeed}
          {baseline && ` · 기준: ${new Date(baseline.at).toLocaleTimeString('ko-KR')} 실행`}
        </span>
      </div>
      <p className={styles.outcome}>
        좌측 {outcome.leftWins}승 · 무 {outcome.draws} · 우측 {outcome.rightWins}승 · 경기당 득점
        좌측 <Measured estimate={outcome.leftGoals} /> / 우측{' '}
        <Measured estimate={outcome.rightGoals} />
      </p>
      {s.match && (
        <div className={styles.match}>
          <p className={styles.score}>
            좌측 팀 {s.match.score[0]} : {s.match.score[1]} 우측 팀
          </p>
          <ul>
            {s.match.goals.map((g, i) => (
              <li key={`g${i}`}>
                {g.minute}′ 골 · {SIDE_NAMES[g.side]} · {g.name}
              </li>
            ))}
            {s.match.cards.map((c, i) => (
              <li key={`c${i}`}>
                {c.minute}′ {CARD[c.kind]} · {SIDE_NAMES[c.side]} · {c.player}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.unequalSides && (
        <p className={styles.note}>
          두 팀의 평균 OVR이 달라 목표 범위(같은 수준의 1부 팀 기준)를 그대로 적용하기 어렵습니다.
        </p>
      )}
      <div className={styles.tables}>
        <TargetTable rows={s.targets} baseline={b?.targets} />
        <SideTable rows={s.sides} baseline={b?.sides} />
      </div>
    </section>
  );
}

function sideLine(side: KeptRun['sides'][number]) {
  return `${tacticLabel[side.tactic]} ${fmt(starterAverage(side.ovrs))}`;
}

function KeptRuns(props: {
  kept: KeptRun[];
  shown?: string;
  baseline?: string;
  onShow: (id: string) => void;
  onPin: (id?: string) => void;
  onLoad: (run: KeptRun) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const { kept, shown, baseline, onShow, onPin, onLoad, onDelete, onClear } = props;
  return (
    <section className={styles.panel} aria-labelledby="lab-kept">
      <div className={styles.panelHead}>
        <h2 id="lab-kept">지난 실행</h2>
        <span className={styles.muted}>최근 {kept.length}개</span>
        <button type="button" onClick={onClear} disabled={!kept.length}>
          모두 지우기
        </button>
      </div>
      {kept.length ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>시각</th>
              <th>경기</th>
              <th>좌측 팀</th>
              <th>우측 팀</th>
              <th>변경값</th>
              <th>동작</th>
            </tr>
          </thead>
          <tbody>
            {kept.map((k) => (
              <tr key={k.id} className={cx(k.id === shown && styles.shown)}>
                <td>
                  {new Date(k.at).toLocaleTimeString('ko-KR')}
                  {k.id === baseline && <span className={styles.badge}>기준</span>}
                </td>
                <td>{k.count}</td>
                <td>{sideLine(k.sides[0])}</td>
                <td>{sideLine(k.sides[1])}</td>
                <td>{Object.keys(k.overrides).length}개</td>
                <td className={styles.actions}>
                  <button type="button" onClick={() => onShow(k.id)} disabled={k.id === shown}>
                    보기
                  </button>
                  {k.id === baseline ? (
                    <button type="button" onClick={() => onPin(undefined)}>
                      기준 해제
                    </button>
                  ) : (
                    <button type="button" onClick={() => onPin(k.id)}>
                      기준으로 고정
                    </button>
                  )}
                  <button type="button" onClick={() => onLoad(k)}>
                    설정 불러오기
                  </button>
                  <button type="button" onClick={() => onDelete(k.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.muted}>끝난 실행이 여기에 남습니다.</p>
      )}
    </section>
  );
}

const keptSide = (side: LabSide): KeptRun['sides'][number] => ({
  seed: side.seed,
  tactic: side.tactic,
  average: side.average,
  spread: side.spread,
  ovrs: [...side.ovrs],
});

export function LabPage() {
  const [state, setState] = useState<LabState>(() => loadLabState());
  const [sides, setSides] = useState<[LabSide | undefined, LabSide | undefined]>([
    undefined,
    undefined,
  ]);
  const [busy, setBusy] = useState<[number, number]>([0, 0]);
  const [reads, setReads] = useState<ReadonlySet<string>>();
  const [running, setRunning] = useState<{ run: LabRun; done: number; total: number }>();
  const [shown, setShown] = useState<string | undefined>(() => state.kept[0]?.id);
  const [message, setMessage] = useState<string>();
  /** 관전: the playing match (keyed so 다시 보기 of the same seed starts over) and the one asked for. */
  const [watched, setWatched] = useState<{
    key: number;
    seed: string;
    playback: MatchPlayback;
    world: World;
  }>();
  const [watching, setWatching] = useState<string>();
  const watchKey = useRef(0);
  const pool = useRef<LabPool | undefined>(undefined);
  const initial = useRef(state);

  useEffect(() => void saveLabState(state), [state]);

  const updateSide = (index: LabSideIndex, change: Partial<SideSettings>) =>
    setState((s) => {
      const next = [...s.sides] as LabState['sides'];
      next[index] = { ...next[index], ...change };
      return { ...s, sides: next };
    });

  const track = (index: LabSideIndex, by: number) =>
    setBusy((b) => {
      const next = [...b] as [number, number];
      next[index] += by;
      return next;
    });

  /** Asks the lab's first worker for a side; a reply for a pool since replaced is dropped. */
  const request = (
    index: LabSideIndex,
    make: (p: LabPool) => Promise<LabSide>,
    edited: boolean,
  ) => {
    const p = pool.current;
    if (!p) return;
    track(index, 1);
    make(p).then(
      (side) => {
        track(index, -1);
        if (pool.current !== p) return;
        setSides((prev) => {
          const next = [...prev] as typeof prev;
          next[index] = side;
          return next;
        });
        updateSide(index, {
          ovrs: side.ovrs,
          average: side.average,
          spread: side.spread,
          edited,
        });
      },
      (error: Error) => {
        track(index, -1);
        if (pool.current !== p) return;
        setMessage(`${SIDE_NAMES[index]}을 만들지 못했습니다: ${error.message}`);
      },
    );
  };

  const generate = (index: LabSideIndex, s: SideSettings, ovrs?: number[]) =>
    request(
      index,
      (p) => p.generate(index, s.seed, s.tactic, s.average, s.spread, ovrs),
      !!ovrs && !!s.edited,
    );

  useEffect(() => {
    const p = new LabPool();
    pool.current = p;
    p.probe().then(
      (paths) => pool.current === p && setReads(new Set(paths)),
      () => {},
    );
    const start = initial.current;
    generate(0, start.sides[0], start.sides[0].ovrs);
    generate(1, start.sides[1], start.sides[1].ovrs);
    return () => {
      pool.current = undefined;
      p.dispose();
    };
    // The pool lives as long as the page; `generate` reads it through the ref.
  }, []);

  const regenerate = (index: LabSideIndex) => {
    const s = state.sides[index];
    if (
      s.edited &&
      !window.confirm(`${SIDE_NAMES[index]}의 선수별 OVR 설정이 새로 생성한 값으로 바뀝니다.`)
    )
      return;
    generate(index, { ...s, edited: false });
  };

  const setOvr = (index: LabSideIndex, player: number, ovr: number) => {
    const side = sides[index];
    if (side) request(index, (p) => p.setOvr(side, index, player, ovr), true);
  };

  const start = () => {
    const p = pool.current;
    const [left, right] = sides;
    if (!p || !left || !right) return;
    setMessage(undefined);
    const { count, runSeed } = state.run;
    const overrides = { ...state.overrides };
    const snapshot = { count, runSeed, overrides, sides: [keptSide(left), keptSide(right)] };
    const run: LabRun = p.start(
      { runSeed, sides: [left, right], overrides, count },
      (done, total) =>
        setRunning((cur) => (cur?.run.runId === run.runId ? { ...cur, done, total } : cur)),
    );
    setRunning({ run, done: 0, total: count });
    void run.result.then((outcome) => {
      setRunning((cur) => (cur?.run === run ? undefined : cur));
      if (outcome.status === 'done') {
        const at = Date.now();
        const kept = {
          id: `${at.toString(36)}-${run.runId}`,
          at,
          ...snapshot,
          summary: outcome.summary,
        } as KeptRun;
        setState((s) => keepRun(s, kept));
        setShown(kept.id);
      } else if (outcome.status === 'rejected')
        setMessage(
          `적용할 수 없는 수치가 있습니다: ${outcome.rejected.map((r) => `${r.path} (${SKIP_REASON[r.reason]})`).join(', ')}`,
        );
      else if (outcome.status === 'failed') setMessage(`실행에 실패했습니다: ${outcome.message}`);
    });
  };

  /**
   * Plays match 0 of `seed` with the sides and values as they are now; the playback under way keeps
   * playing until the new one is ready, and a later edit never reaches either.
   */
  const watch = (seed: string) => {
    const p = pool.current;
    const [left, right] = sides;
    if (!p || !left || !right || !seed) return;
    setMessage(undefined);
    setState((s) => ({ ...s, watch: { seed } }));
    const key = ++watchKey.current;
    setWatching(seed);
    const failed = (text: string) => {
      if (watchKey.current !== key) return;
      setWatching(undefined);
      setMessage(text);
    };
    Promise.all([p.world(), p.watch(seed, [left, right], { ...state.overrides })]).then(
      ([world, outcome]) => {
        if (pool.current !== p || watchKey.current !== key || outcome.status === 'superseded')
          return;
        if (outcome.status === 'done') {
          setWatching(undefined);
          setWatched({ key, seed, playback: outcome.playback, world });
        } else if (outcome.status === 'rejected')
          failed(
            `적용할 수 없는 수치가 있습니다: ${outcome.rejected.map((r) => `${r.path} (${SKIP_REASON[r.reason]})`).join(', ')}`,
          );
        else failed(`관전 경기를 치르지 못했습니다: ${outcome.message}`);
      },
      (error: Error) =>
        pool.current === p && failed(`관전 경기를 치르지 못했습니다: ${error.message}`),
    );
  };

  const loadRun = (k: KeptRun) => {
    setState((s) => ({
      ...s,
      sides: [
        { ...k.sides[0], edited: true },
        { ...k.sides[1], edited: true },
      ],
      overrides: { ...k.overrides },
      run: { count: k.count, runSeed: k.runSeed },
    }));
    generate(0, { ...k.sides[0], edited: true }, k.sides[0].ovrs);
    generate(1, { ...k.sides[1], edited: true }, k.sides[1].ovrs);
  };

  const resetAll = () => {
    if (!window.confirm('이 브라우저에 남긴 팀, 수치, 지난 실행을 모두 지웁니다.')) return;
    running?.run.cancel();
    const fresh = defaultLabState();
    setState(fresh);
    setShown(undefined);
    generate(0, fresh.sides[0]);
    generate(1, fresh.sides[1]);
  };

  const current = state.kept.find((k) => k.id === shown) ?? state.kept[0];
  const pinned = state.kept.find((k) => k.id === state.baseline);
  const baseline = pinned && pinned.id !== current?.id ? pinned : undefined;
  const ready = !!sides[0] && !!sides[1];
  const changed = useMemo(() => Object.keys(state.overrides).length, [state.overrides]);

  let runBar: ReactNode;
  if (running)
    runBar = (
      <>
        <progress
          aria-label="진행"
          max={running.total}
          value={running.done}
          className={styles.progress}
        />
        <span>
          {running.done} / {running.total}경기
        </span>
        <button type="button" onClick={() => running.run.cancel()}>
          취소
        </button>
      </>
    );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>경기 실험실</h1>
        <p className={styles.muted}>
          게임 저장과 상관없는 실험 공간입니다. 여기서 바꾼 수치는 이 페이지의 실험에만 쓰입니다.
        </p>
        <button type="button" onClick={resetAll}>
          모두 초기화
        </button>
      </header>
      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
      <section className={styles.watch} aria-label="관전">
        <div className={cx(styles.panel, styles.runBar)}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => watch(state.watch.seed)}
            disabled={!ready}
          >
            관전
          </button>
          <label>
            관전 시드
            <input
              className={styles.seed}
              aria-label="관전 시드"
              value={state.watch.seed}
              onChange={(e) => setState((s) => ({ ...s, watch: { seed: e.target.value } }))}
            />
          </label>
          {watching !== undefined && (
            <>
              <progress aria-label="관전 경기 준비" className={styles.progress} />
              <span role="status">{watching} 경기를 치르는 중…</span>
            </>
          )}
          <span className={styles.muted}>
            지금의 두 팀과 수치로 한 경기를 치러 게임의 경기 화면 그대로 보여 줍니다.
          </span>
        </div>
        {watched && (
          <div className={styles.watchView}>
            <Pitch
              key={watched.key}
              playback={watched.playback}
              world={watched.world}
              actions={() => (
                <div className={styles.actions}>
                  <button type="button" onClick={() => watch(watched.seed)} disabled={!ready}>
                    다시 보기
                  </button>
                  <button type="button" onClick={() => watch(newSeed())} disabled={!ready}>
                    새 경기
                  </button>
                </div>
              )}
            />
          </div>
        )}
      </section>
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="lab-sides">
          <div className={styles.panelHead}>
            <h2 id="lab-sides">팀</h2>
          </div>
          <div className={styles.sides}>
            {([0, 1] as const).map((i) => (
              <SidePanel
                key={i}
                index={i}
                settings={state.sides[i]}
                side={sides[i]}
                busy={busy[i] > 0}
                onSettings={(change) => updateSide(i, change)}
                onGenerate={() => regenerate(i)}
                onOvr={(player, ovr) => setOvr(i, player, ovr)}
              />
            ))}
          </div>
        </section>
        <ValuesPanel
          overrides={state.overrides}
          reads={reads}
          onChange={(overrides) => setState((s) => ({ ...s, overrides }))}
        />
      </div>
      <section className={cx(styles.panel, styles.runBar)} aria-label="실행">
        <label>
          경기 수
          <select
            aria-label="경기 수"
            value={state.run.count}
            onChange={(e) =>
              setState((s) => ({ ...s, run: { ...s.run, count: Number(e.target.value) } }))
            }
          >
            {RUN_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          실행 시드
          <input
            className={styles.seed}
            aria-label="실행 시드"
            value={state.run.runSeed}
            onChange={(e) =>
              setState((s) => ({ ...s, run: { ...s.run, runSeed: e.target.value } }))
            }
          />
        </label>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, run: { ...s.run, runSeed: newSeed() } }))}
        >
          새로 뽑기
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={start}
          disabled={!ready || !!running}
        >
          시뮬레이션
        </button>
        <span className={styles.muted}>변경값 {changed}개</span>
        {runBar}
      </section>
      {current && <Results run={current} baseline={baseline} />}
      <KeptRuns
        kept={state.kept}
        shown={current?.id}
        baseline={state.baseline}
        onShow={setShown}
        onPin={(id) => setState((s) => ({ ...s, baseline: id }))}
        onLoad={loadRun}
        onDelete={(id) => setState((s) => dropRun(s, id))}
        onClear={() => setState((s) => ({ ...s, kept: [], baseline: undefined }))}
      />
    </div>
  );
}
