import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayLocale, displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
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
import koJson from './tunables.ko.json';
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
/** Each group's and value's Korean description, written from the code that reads it (→LAB-3). */
const KO = koJson as { groups: Record<string, string>; leaves: Record<string, string> };
const LEAVES = catalog.groups.flatMap((g) => g.leaves);
const SIDE_NAMES = [
  sourceMessage('copy.LabPage.d192ee8a47'),
  sourceMessage('copy.LabPage.bb56f4ce84'),
] as const;
/**
 * Groups the page's own match view reads (Pitch and its figure code import MATCH_MOTION_CONFIG):
 * an override reaches the worker's match and frames, but the view draws with the code's values.
 */
const PAGE_READ_GROUPS: ReadonlySet<string> = new Set(['MATCH_MOTION_CONFIG']);
const SKIP_REASON = {
  unknown: sourceMessage('copy.LabPage.e4305c5605'),
  'not-a-number': sourceMessage('copy.LabPage.793fc429ee'),
  'load-time': sourceMessage('copy.LabPage.3ab38dcb65'),
} as const;

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

function fmt(value: number | null | undefined, unit = 'count') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const text = value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  if (unit === 'percent') return `${text}%`;
  if (unit === 'minutes') return sourceMessage('copy.LabPage.be847e9e64', { p0: text });
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
  useTextLocale();
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
      aria-label={localizeValue(label)}
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
  useTextLocale();
  const { index, settings, side, busy, onSettings, onGenerate, onOvr } = props;
  const name = SIDE_NAMES[index];
  const ovrs = side?.ovrs ?? [];
  // A pending worker reply restores its settings snapshot along with the generated squad.
  const settingsLocked = busy || !side;
  return (
    <section className={styles.side} aria-label={localizeValue(name)}>
      <h3>{localizeValue(name)}</h3>
      <div className={styles.fields}>
        <label>
          {richMessage('copy.LabPage.cf0cfa5890', {
            p0: (
              <select
                aria-label={displayMessage('copy.LabPage.442293bcd2', { p0: name })}
                value={settings.tactic}
                disabled={settingsLocked}
                onChange={(e) => onSettings({ tactic: e.target.value as Tactic })}
              >
                {localizeValue(
                  LAB_TACTICS.map((t) => (
                    <option key={t} value={t}>
                      {localizeValue(tacticLabel[t])}
                    </option>
                  )),
                )}
              </select>
            ),
          })}
        </label>
        <label>
          {richMessage('copy.LabPage.603fcd2e31', {
            p0: (
              <NumberField
                label={displayMessage('copy.LabPage.a9e6bba947', { p0: name })}
                value={settings.average}
                disabled={settingsLocked}
                min={LAB_RANGES.average[0]}
                max={LAB_RANGES.average[1]}
                onCommit={(v) => onSettings({ average: Math.round(v) })}
              />
            ),
          })}
        </label>
        <label>
          {richMessage('copy.LabPage.16fc53396c', {
            p0: (
              <NumberField
                label={displayMessage('copy.LabPage.a9379512de', { p0: name })}
                value={settings.spread}
                disabled={settingsLocked}
                min={LAB_RANGES.spread[0]}
                max={LAB_RANGES.spread[1]}
                onCommit={(v) => onSettings({ spread: Math.round(v) })}
              />
            ),
          })}
        </label>
        <label>
          {richMessage('copy.LabPage.546bec3e09', {
            p0: (
              <input
                className={styles.seed}
                aria-label={displayMessage('copy.LabPage.f4c74d05aa', { p0: name })}
                value={settings.seed}
                disabled={settingsLocked}
                onChange={(e) => onSettings({ seed: e.target.value })}
              />
            ),
          })}
        </label>
        <button
          type="button"
          onClick={() => onSettings({ seed: newSeed() })}
          disabled={settingsLocked}
        >
          {richMessage('copy.LabPage.85e81f0a89')}
        </button>
        <button type="button" className={styles.primary} onClick={onGenerate} disabled={busy}>
          {localizeValue(
            busy
              ? sourceMessage('copy.LabPage.6158892198')
              : sourceMessage('copy.LabPage.167eff2736'),
          )}
        </button>
      </div>
      <p className={styles.average}>
        {richMessage('copy.LabPage.ac9206466e', {
          p0: <strong>{localizeValue(ovrs.length ? fmt(starterAverage(ovrs)) : '–')}</strong>,
          p1:
            side &&
            sourceMessage('copy.LabPage.464e6cdb5b', {
              p0: tacticLabel[side.tactic],
              p1: side.seed,
            }),
        })}
      </p>
      {localizeValue(
        side && (
          <table className={styles.squad}>
            <thead>
              <tr>
                <th>#</th>
                <th>{richMessage('copy.LabPage.0f4adfe312')}</th>
                <th>{richMessage('copy.LabPage.253d1510ca')}</th>
                <th>{richMessage('team.column.ovr')}</th>
                <th>{richMessage('copy.LabPage.d8ba487317')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                side.players.map((p, i) => (
                  <tr key={p.id} className={cx(i === STARTERS && styles.benchStart)}>
                    <td>{localizeValue(i + 1)}</td>
                    <td>{localizeValue(p.position)}</td>
                    <td>{p.name}</td>
                    <td>
                      <NumberField
                        label={displayMessage('copy.LabPage.0c46454fc5', { p0: name, p1: i + 1 })}
                        value={side.ovrs[i]!}
                        disabled={busy}
                        min={LAB_RANGES.ovr[0]}
                        max={LAB_RANGES.ovr[1]}
                        onCommit={(v) => onOvr(i, Math.round(v))}
                      />
                    </td>
                    <td>
                      {localizeValue(
                        i < STARTERS
                          ? sourceMessage('copy.LabPage.2957cbaf9c')
                          : sourceMessage('copy.LabPage.084c5a6dd7'),
                      )}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        ),
      )}
    </section>
  );
}

function ValuesPanel(props: {
  overrides: Record<string, number>;
  reads?: ReadonlySet<string>;
  onChange: (overrides: Record<string, number>) => void;
}) {
  useTextLocale();
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
    (!q ||
      leaf.path.toLowerCase().includes(q) ||
      (KO.leaves[leaf.path] ?? '').toLowerCase().includes(q) ||
      leaf.comment.toLowerCase().includes(q));
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
      () => setNote(sourceMessage('copy.LabPage.d8fd3a2546', { p0: changed })),
      () => setNote(sourceMessage('copy.LabPage.e2a7cdf159')),
    );
  };
  const paste = () => {
    const result = importOverrides(transfer, LEAVES);
    if (!result.ok) return setNote(result.message);
    onChange({ ...overrides, ...result.overrides });
    const applied = Object.keys(result.overrides).length;
    setNote(
      sourceMessage('copy.LabPage.fb8d3c511a', { p0: applied }) +
        (result.skipped.length
          ? sourceMessage('copy.LabPage.b480760b61', {
              p0: result.skipped.map((s) => `${s.path} (${SKIP_REASON[s.reason]})`).join(', '),
            })
          : ''),
    );
  };
  return (
    <section className={styles.panel} aria-labelledby="lab-values">
      <div className={styles.panelHead}>
        <h2 id="lab-values">{richMessage('copy.LabPage.e9b1a9a478')}</h2>
        <span className={styles.muted}>
          {richMessage('copy.LabPage.c270bcbc4b', { p0: changed })}
        </span>
        <button type="button" onClick={() => onChange({})} disabled={!changed}>
          {richMessage('copy.LabPage.91211d8faa')}
        </button>
      </div>
      <div className={styles.fields}>
        <input
          className={styles.search}
          type="search"
          aria-label={displayMessage('copy.LabPage.06a4ddd013')}
          placeholder={displayMessage('copy.LabPage.526a5ce604')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {localizeValue(
          reads && unread > 0 && (
            <label className={styles.check}>
              {richMessage('copy.LabPage.7f66f7689c', {
                p0: (
                  <input
                    type="checkbox"
                    checked={showUnread}
                    onChange={(e) => setShowUnread(e.target.checked)}
                  />
                ),
                p1: unread,
              })}
            </label>
          ),
        )}
      </div>
      <div className={styles.groups}>
        {localizeValue(
          catalog.groups.map((group) => {
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
                      {richMessage('copy.LabPage.f1582550cc', {
                        p0: leaves.length,
                        p1: groupChanged.length
                          ? sourceMessage('copy.LabPage.42a96c32f3', { p0: groupChanged.length })
                          : '',
                      })}
                    </span>
                    {localizeValue(
                      KO.groups[group.name] && (
                        <span className={styles.groupDescription}>
                          {localizeValue(KO.groups[group.name])}
                        </span>
                      ),
                    )}
                    {localizeValue(
                      PAGE_READ_GROUPS.has(group.name) && (
                        <span
                          className={styles.badge}
                          title={displayMessage('copy.LabPage.f93fc408de')}
                        >
                          {richMessage('copy.LabPage.383e742f33')}
                        </span>
                      ),
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => reset(groupChanged.map((l) => l.path))}
                    disabled={!groupChanged.length}
                  >
                    {richMessage('copy.LabPage.4f948b8deb')}
                  </button>
                </div>
                {localizeValue(
                  isOpen && (
                    <ul className={styles.leaves}>
                      {localizeValue(
                        leaves.map((leaf) => {
                          const current = overrides[leaf.path] ?? leaf.value;
                          const isChanged = leaf.path in overrides;
                          return (
                            <li
                              key={leaf.path}
                              className={cx(styles.leaf, isChanged && styles.changed)}
                            >
                              <div className={styles.leafHead}>
                                <code>{localizeValue(leaf.path)}</code>
                                {localizeValue(
                                  isChanged && (
                                    <span className={styles.badge}>
                                      {richMessage('copy.LabPage.16f64fe47b')}
                                    </span>
                                  ),
                                )}
                              </div>
                              {localizeValue(
                                KO.leaves[leaf.path] && (
                                  <p className={styles.description}>
                                    {localizeValue(KO.leaves[leaf.path])}
                                  </p>
                                ),
                              )}
                              {localizeValue(
                                leaf.comment && (
                                  <p className={styles.comment} title={localizeValue(leaf.comment)}>
                                    {localizeValue(leaf.comment)}
                                  </p>
                                ),
                              )}
                              <div className={styles.leafValues}>
                                <span className={styles.muted}>
                                  {richMessage('copy.LabPage.5971fd7b69', { p0: leaf.value })}
                                </span>
                                <NumberField
                                  label={localizeValue(leaf.path)}
                                  value={current}
                                  disabled={leaf.loadTime}
                                  onCommit={(v) => onChange(setOverride(overrides, leaf, v))}
                                />
                                <button
                                  type="button"
                                  onClick={() => reset([leaf.path])}
                                  disabled={!isChanged}
                                >
                                  {richMessage('copy.LabPage.893f3d9463')}
                                </button>
                              </div>
                              {localizeValue(
                                leaf.loadTime && (
                                  <p className={styles.muted}>
                                    {richMessage('copy.LabPage.a128480adc')}
                                  </p>
                                ),
                              )}
                            </li>
                          );
                        }),
                      )}
                    </ul>
                  ),
                )}
              </div>
            );
          }),
        )}
      </div>
      <div className={styles.transfer}>
        <div className={styles.fields}>
          <button type="button" onClick={copy} disabled={!changed}>
            {richMessage('copy.LabPage.a5b6a65722')}
          </button>
          <button type="button" onClick={paste} disabled={!transfer.trim()}>
            {richMessage('copy.LabPage.8e45bfbb76')}
          </button>
        </div>
        <textarea
          aria-label={displayMessage('copy.LabPage.9db159f659')}
          placeholder={JSON.stringify({ 'SHOT_CONFIG.saveShare': 0.4 })}
          value={transfer}
          onChange={(e) => setTransfer(e.target.value)}
          rows={4}
        />
        {localizeValue(note && <p role="status">{localizeValue(note)}</p>)}
      </div>
    </section>
  );
}

function Measured(props: { estimate?: Estimate; unit?: string }) {
  useTextLocale();
  const { estimate, unit } = props;
  if (!estimate) return <>–</>;
  const h = half(estimate);
  return (
    <>
      {localizeValue(fmt(estimate.value, unit))}
      {localizeValue(
        Number.isFinite(h) && h > 0 && <small> ± {localizeValue(fmt(h, unit))}</small>,
      )}
    </>
  );
}

function Difference(props: { cmp?: Comparison; unit?: string }) {
  useTextLocale();
  const { cmp, unit } = props;
  if (!cmp) return <>–</>;
  return (
    <span
      className={cx(cmp.marked && styles.marked)}
      title={localizeValue(cmp.marked ? sourceMessage('copy.LabPage.63f935e897') : undefined)}
    >
      {localizeValue(signed(cmp.difference, unit))}
      {localizeValue(cmp.marked && ' ●')}
    </span>
  );
}

function TargetTable(props: { rows: TargetRow[]; baseline?: TargetRow[] }) {
  useTextLocale();
  const { rows, baseline } = props;
  return (
    <table className={styles.table}>
      <caption>{richMessage('copy.LabPage.e33f0cd11f')}</caption>
      <thead>
        <tr>
          <th>{richMessage('copy.LabPage.962f286b14')}</th>
          <th>{richMessage('copy.LabPage.8cc431931d')}</th>
          <th>{richMessage('copy.LabPage.237e0f995d')}</th>
          <th>{richMessage('copy.LabPage.fb77d92a3c')}</th>
          {localizeValue(
            baseline && (
              <>
                <th>{richMessage('copy.LabPage.eaea55bff6')}</th>
                <th>{richMessage('copy.LabPage.b9b47d9dee')}</th>
              </>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {localizeValue(
          rows.map((row) => {
            const base = baseline?.find((b) => b.id === row.id);
            const cmp = compare(row.estimate, base?.estimate);
            return (
              <tr key={row.id}>
                <th scope="row">
                  {localizeValue(row.label)}
                  <small className={styles.muted}> {localizeValue(row.id)}</small>
                </th>
                <td>
                  {localizeValue(fmt(row.real[0], row.unit))}–
                  {localizeValue(fmt(row.real[1], row.unit))}
                  <small className={styles.muted}>
                    {richMessage('copy.LabPage.4c0614ae12', {
                      p0: ' ',
                      p1: fmt(row.band[0], row.unit),
                      p2: fmt(row.band[1], row.unit),
                    })}
                  </small>
                </td>
                <td>
                  <Measured estimate={row.estimate} unit={row.unit} />
                </td>
                <td className={cx(row.pass === false && styles.fail)}>
                  {localizeValue(
                    row.pass === undefined
                      ? sourceMessage('copy.LabPage.a572fea8f1')
                      : row.pass
                        ? sourceMessage('copy.LabPage.07b9cb2b98')
                        : sourceMessage('copy.LabPage.175a0f8f2b'),
                  )}
                </td>
                {localizeValue(
                  baseline && (
                    <>
                      <td>
                        <Measured estimate={base?.estimate} unit={row.unit} />
                      </td>
                      <td>
                        <Difference cmp={cmp} unit={row.unit} />
                      </td>
                    </>
                  ),
                )}
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

function SideCell(props: { row: SideRow; side: 'left' | 'right'; baseline?: SideRow }) {
  useTextLocale();
  const { row, side, baseline } = props;
  const cmp = compare(row[side], baseline?.[side]);
  return (
    <td>
      <Measured estimate={row[side]} unit={row.unit} />
      {localizeValue(
        baseline && (
          <div className={styles.muted}>
            {richMessage('copy.LabPage.f5867ebe57', {
              p0: fmt(baseline[side].value, row.unit),
              p1: <Difference cmp={cmp} unit={row.unit} />,
            })}
          </div>
        ),
      )}
    </td>
  );
}

function SideTable(props: { rows: SideRow[]; baseline?: SideRow[] }) {
  useTextLocale();
  const { rows, baseline } = props;
  return (
    <table className={styles.table}>
      <caption>{richMessage('copy.LabPage.eba42dd591')}</caption>
      <thead>
        <tr>
          <th>{richMessage('copy.LabPage.962f286b14')}</th>
          <th>{richMessage('copy.LabPage.d192ee8a47')}</th>
          <th>{richMessage('copy.LabPage.bb56f4ce84')}</th>
        </tr>
      </thead>
      <tbody>
        {localizeValue(
          rows.map((row) => {
            const base = baseline?.find((b) => b.id === row.id);
            return (
              <tr key={row.id}>
                <th scope="row">{localizeValue(row.label)}</th>
                <SideCell row={row} side="left" baseline={base} />
                <SideCell row={row} side="right" baseline={base} />
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

const CARD = {
  yellow: sourceMessage('copy.LabPage.6c0f751064'),
  secondYellow: sourceMessage('copy.LabPage.3561565380'),
  red: sourceMessage('copy.LabPage.68e69c7b9c'),
} as const;

function Results(props: { run: KeptRun; baseline?: KeptRun }) {
  useTextLocale();
  const { run, baseline } = props;
  const s: RunSummary = run.summary;
  const b = baseline?.summary;
  const { outcome } = s;
  return (
    <section className={styles.panel} aria-labelledby="lab-results">
      <div className={styles.panelHead}>
        <h2 id="lab-results">{richMessage('copy.LabPage.109383e344')}</h2>
        <span className={styles.muted}>
          {richMessage('copy.LabPage.334a81526e', {
            p0: s.matches,
            p1: run.runSeed,
            p2:
              baseline &&
              sourceMessage('copy.LabPage.4737ef5605', {
                p0: new Date(baseline.at).toLocaleTimeString(displayLocale()),
              }),
          })}
        </span>
      </div>
      <p className={styles.outcome}>
        {richMessage('copy.LabPage.e6a43dde32', {
          p0: outcome.leftWins,
          p1: outcome.draws,
          p2: outcome.rightWins,
          p3: <Measured estimate={outcome.leftGoals} />,
          p4: ' ',
          p5: <Measured estimate={outcome.rightGoals} />,
        })}
      </p>
      {localizeValue(
        s.match && (
          <div className={styles.match}>
            <p className={styles.score}>
              {richMessage('copy.LabPage.92d77e82ed', {
                p0: s.match.score[0],
                p1: s.match.score[1],
              })}
            </p>
            <ul>
              {localizeValue(
                s.match.goals.map((g, i) => (
                  <li key={`g${i}`}>
                    {richMessage('copy.LabPage.a228bd6ea3', {
                      p0: g.minute,
                      p1: SIDE_NAMES[g.side],
                      p2: g.name,
                    })}
                  </li>
                )),
              )}
              {localizeValue(
                s.match.cards.map((c, i) => (
                  <li key={`c${i}`}>
                    {localizeValue(c.minute)}′ {localizeValue(CARD[c.kind])} ·{' '}
                    {localizeValue(SIDE_NAMES[c.side])} · {localizeValue(c.player)}
                  </li>
                )),
              )}
            </ul>
          </div>
        ),
      )}
      {localizeValue(
        s.unequalSides && <p className={styles.note}>{richMessage('copy.LabPage.b3260ea1a1')}</p>,
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
  useTextLocale();
  const { kept, shown, baseline, onShow, onPin, onLoad, onDelete, onClear } = props;
  return (
    <section className={styles.panel} aria-labelledby="lab-kept">
      <div className={styles.panelHead}>
        <h2 id="lab-kept">{richMessage('copy.LabPage.b81302e48a')}</h2>
        <span className={styles.muted}>
          {richMessage('copy.LabPage.6e77514482', { p0: kept.length })}
        </span>
        <button type="button" onClick={onClear} disabled={!kept.length}>
          {richMessage('copy.LabPage.645b60b46a')}
        </button>
      </div>
      {localizeValue(
        kept.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{richMessage('copy.LabPage.faea4ccff0')}</th>
                <th>{richMessage('copy.LabPage.e56314e9a1')}</th>
                <th>{richMessage('copy.LabPage.d192ee8a47')}</th>
                <th>{richMessage('copy.LabPage.bb56f4ce84')}</th>
                <th>{richMessage('copy.LabPage.cb353f0c69')}</th>
                <th>{richMessage('copy.LabPage.e0d6a8db23')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                kept.map((k) => (
                  <tr key={k.id} className={cx(k.id === shown && styles.shown)}>
                    <td>
                      {localizeValue(new Date(k.at).toLocaleTimeString(displayLocale()))}
                      {localizeValue(
                        k.id === baseline && (
                          <span className={styles.badge}>
                            {richMessage('copy.LabPage.eaea55bff6')}
                          </span>
                        ),
                      )}
                    </td>
                    <td>{localizeValue(k.count)}</td>
                    <td>{localizeValue(sideLine(k.sides[0]))}</td>
                    <td>{localizeValue(sideLine(k.sides[1]))}</td>
                    <td>
                      {richMessage('copy.ConstantsPage.f62174360f', {
                        p0: Object.keys(k.overrides).length,
                      })}
                    </td>
                    <td className={styles.actions}>
                      <button type="button" onClick={() => onShow(k.id)} disabled={k.id === shown}>
                        {richMessage('copy.LabPage.ac5b575fff')}
                      </button>
                      {localizeValue(
                        k.id === baseline ? (
                          <button type="button" onClick={() => onPin(undefined)}>
                            {richMessage('copy.LabPage.d4c648b0e0')}
                          </button>
                        ) : (
                          <button type="button" onClick={() => onPin(k.id)}>
                            {richMessage('copy.LabPage.7fe5caa742')}
                          </button>
                        ),
                      )}
                      <button type="button" onClick={() => onLoad(k)}>
                        {richMessage('copy.LabPage.a4ecad8495')}
                      </button>
                      <button type="button" onClick={() => onDelete(k.id)}>
                        {richMessage('slots.delete')}
                      </button>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>{richMessage('copy.LabPage.78340ab663')}</p>
        ),
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
  useTextLocale();
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
  const watchView = useRef<HTMLDivElement>(null);
  // A new playback brings the whole match view into the screen.
  useEffect(() => {
    if (watched) watchView.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [watched?.key]);
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
        setMessage(
          sourceMessage('copy.LabPage.e9654a4bd0', { p0: SIDE_NAMES[index], p1: error.message }),
        );
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
      !window.confirm(displayMessage('copy.LabPage.9c82b8b02b', { p0: SIDE_NAMES[index] }))
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
          sourceMessage('copy.LabPage.1b78f82acc', {
            p0: outcome.rejected.map((r) => `${r.path} (${SKIP_REASON[r.reason]})`).join(', '),
          }),
        );
      else if (outcome.status === 'failed')
        setMessage(sourceMessage('copy.LabPage.512408b5ba', { p0: outcome.message }));
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
            sourceMessage('copy.LabPage.1b78f82acc', {
              p0: outcome.rejected.map((r) => `${r.path} (${SKIP_REASON[r.reason]})`).join(', '),
            }),
          );
        else failed(sourceMessage('copy.LabPage.83894ffb47', { p0: outcome.message }));
      },
      (error: Error) =>
        pool.current === p &&
        failed(sourceMessage('copy.LabPage.83894ffb47', { p0: error.message })),
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
    if (!window.confirm(displayMessage('copy.LabPage.53956ce6eb'))) return;
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
          aria-label={displayMessage('copy.LabPage.52e94db6f6')}
          max={running.total}
          value={running.done}
          className={styles.progress}
        />
        <span>
          {richMessage('copy.LabPage.49b7facf92', { p0: running.done, p1: running.total })}
        </span>
        <button type="button" onClick={() => running.run.cancel()}>
          {richMessage('common.cancel')}
        </button>
      </>
    );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{richMessage('copy.LabPage.1ba62d7fd5')}</h1>
        <a href="/constants">{richMessage('copy.LabPage.d8e88345c3')}</a>
        <p className={styles.muted}>{richMessage('copy.LabPage.ef624e9171')}</p>
        <button type="button" onClick={resetAll}>
          {richMessage('copy.LabPage.3125395484')}
        </button>
      </header>
      {localizeValue(
        message && (
          <p role="alert" className={styles.alert}>
            {localizeValue(message)}
          </p>
        ),
      )}
      <section className={styles.watch} aria-label={displayMessage('copy.LabPage.abde4e363d')}>
        <div className={cx(styles.panel, styles.runBar)}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => watch(state.watch.seed)}
            disabled={!ready}
          >
            {richMessage('copy.LabPage.abde4e363d')}
          </button>
          <label>
            {richMessage('copy.LabPage.59fc7f1b65', {
              p0: (
                <input
                  className={styles.seed}
                  aria-label={displayMessage('copy.LabPage.165c6c4dcd')}
                  value={state.watch.seed}
                  onChange={(e) => setState((s) => ({ ...s, watch: { seed: e.target.value } }))}
                />
              ),
            })}
          </label>
          {localizeValue(
            watching !== undefined && (
              <>
                <progress
                  aria-label={displayMessage('copy.LabPage.243fe41d3a')}
                  className={styles.progress}
                />
                <span role="status">
                  {richMessage('copy.LabPage.d5281a40ec', { p0: watching })}
                </span>
              </>
            ),
          )}
          <span className={styles.muted}>{richMessage('copy.LabPage.915243021e')}</span>
        </div>
        {localizeValue(
          watched && (
            <div className={styles.watchView} ref={watchView}>
              <Pitch
                key={watched.key}
                playback={watched.playback}
                world={watched.world}
                actions={() => (
                  <div className={styles.actions}>
                    <button type="button" onClick={() => watch(watched.seed)} disabled={!ready}>
                      {richMessage('copy.LabPage.6bf1632192')}
                    </button>
                    <button type="button" onClick={() => watch(newSeed())} disabled={!ready}>
                      {richMessage('copy.LabPage.1e49b0211f')}
                    </button>
                  </div>
                )}
              />
            </div>
          ),
        )}
      </section>
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="lab-sides">
          <div className={styles.panelHead}>
            <h2 id="lab-sides">{richMessage('navigation.team')}</h2>
          </div>
          <div className={styles.sides}>
            {localizeValue(
              ([0, 1] as const).map((i) => (
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
              )),
            )}
          </div>
        </section>
        <ValuesPanel
          overrides={state.overrides}
          reads={reads}
          onChange={(overrides) => setState((s) => ({ ...s, overrides }))}
        />
      </div>
      <section
        className={cx(styles.panel, styles.runBar)}
        aria-label={displayMessage('copy.LabPage.ac2a58826d')}
      >
        <label>
          {richMessage('copy.LabPage.acf8fc8e3c', {
            p0: (
              <select
                aria-label={displayMessage('copy.LabPage.f07dd0f9ea')}
                value={state.run.count}
                onChange={(e) =>
                  setState((s) => ({ ...s, run: { ...s.run, count: Number(e.target.value) } }))
                }
              >
                {localizeValue(
                  RUN_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {localizeValue(n)}
                    </option>
                  )),
                )}
              </select>
            ),
          })}
        </label>
        <label>
          {richMessage('copy.LabPage.b45d3b9498', {
            p0: (
              <input
                className={styles.seed}
                aria-label={displayMessage('copy.LabPage.0c6ad2d587')}
                value={state.run.runSeed}
                onChange={(e) =>
                  setState((s) => ({ ...s, run: { ...s.run, runSeed: e.target.value } }))
                }
              />
            ),
          })}
        </label>
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, run: { ...s.run, runSeed: newSeed() } }))}
        >
          {richMessage('copy.LabPage.85e81f0a89')}
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={start}
          disabled={!ready || !!running}
        >
          {richMessage('copy.LabPage.e86faa0dd5')}
        </button>
        <span className={styles.muted}>
          {richMessage('copy.LabPage.281431971f', { p0: changed })}
        </span>
        {localizeValue(runBar)}
      </section>
      {localizeValue(current && <Results run={current} baseline={baseline} />)}
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
