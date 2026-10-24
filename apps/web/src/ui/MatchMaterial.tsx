import { useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import {
  BAND_EDGES,
  LANE_EDGES,
  PITCH,
  cellName,
} from '../../../../packages/engine/src/grid/pitch';
import {
  VIEW,
  cellAt,
  cellRect,
  heatCells,
  heatChoices,
  heatOf,
  networkView,
  ownSide,
  px,
  py,
  shotDots,
  shotTotals,
  sideReport,
  topToucher,
  type HeatCell,
} from './materialView';
import { TabList } from './PageTabs';
import { usePlayerSheet } from './state';
import { Segments } from './Segments';
import { Select } from './Select';
import s from './MatchMaterial.module.css';
import { usePitchSkin } from './usePitchSkin';
import app from './App.module.css';

type Tab = 'shots' | 'heat' | 'network' | 'report';
const TABS = [
  ['shots', '슛 지도'],
  ['heat', '히트맵'],
  ['network', '패스 연결망'],
  ['report', '전술 해설'],
] as const;

/**
 * An own match's post-match material (→WEB-84, MATCH-25): shot map, heat maps, pass network and
 * tactical report, each on the theatre's 1.9:1 pitch. Loaded lazily, outside the entry (→ARCH-28).
 */
export function MatchMaterial({ record, w }: { record: MatchRecord; w: World }) {
  const [tab, setTab] = useState<Tab>('shots');
  const id = `material-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!record.material) {
    const top = topToucher(record, w);
    return (
      <section className={s.material} aria-label="경기 자료">
        <p className={s.missing} role="status">
          이 경기의 지도는 보관하지 않아요 — 선수의 시즌 히트맵을 확인하세요
        </p>
        {top && (
          <p className={s.caption}>
            이 경기의 최다 터치:{' '}
            <button
              type="button"
              className={s.playerLink}
              aria-label={`${top.name} 선수 기록`}
              onClick={(event) => {
                event.currentTarget.focus();
                usePlayerSheet.getState().open(top.id);
              }}
            >
              {top.name}
            </button>
          </p>
        )}
      </section>
    );
  }
  return (
    <section className={s.material} aria-label="경기 자료">
      <TabList
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label="경기 자료 보기"
        idPrefix={id}
        className={app.seasonTabs}
      />
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'shots' && <ShotMap record={record} w={w} />}
        {tab === 'heat' && <HeatMaps record={record} w={w} />}
        {tab === 'network' && <Network record={record} w={w} />}
        {tab === 'report' && <Report record={record} w={w} />}
      </div>
    </section>
  );
}

const FIELD = {
  x: VIEW.pad,
  y: VIEW.pad,
  width: VIEW.width - VIEW.pad * 2,
  height: VIEW.height - VIEW.pad * 2,
};

/** The pitch lines at their real places, so the 40 cells sit on the boxes they are named after. */
function Markings() {
  const box = [LANE_EDGES[1], LANE_EDGES[4]] as const;
  const six = [LANE_EDGES[2], LANE_EDGES[3]] as const;
  const end = (x: number, depth: number, span: readonly [number, number]) => (
    <rect
      x={px(Math.min(x, x + depth))}
      y={py(span[0])}
      width={px(Math.abs(depth)) - px(0)}
      height={py(span[1]) - py(span[0])}
    />
  );
  return (
    <g className={s.lines}>
      <rect {...FIELD} />
      <line x1={px(PITCH.length / 2)} y1={FIELD.y} x2={px(PITCH.length / 2)} y2={py(PITCH.width)} />
      <ellipse
        cx={px(PITCH.length / 2)}
        cy={py(PITCH.width / 2)}
        rx={FIELD.width * 0.09}
        ry={FIELD.height * 0.15}
      />
      {end(0, BAND_EDGES[2], box)}
      {end(0, BAND_EDGES[1], six)}
      {end(PITCH.length, -BAND_EDGES[2], box)}
      {end(PITCH.length, -BAND_EDGES[1], six)}
    </g>
  );
}

/**
 * The 1.9:1 pitch with the side it describes attacking right. Tapping it names the cell under the
 * finger (→WEB-84), or what a marked shape stands for.
 */
function MaterialPitch({
  label,
  children,
  cells,
  describe,
  legend,
}: {
  label: string;
  children?: ReactNode;
  /** A heat map's shaded cells, under everything else. */
  cells?: HeatCell[];
  /** What a tap on a cell says beyond its name. */
  describe?: (cell: number) => string;
  legend?: ReactNode;
}) {
  const [note, setNote] = useState<{ cell?: number; text: string }>();
  const groundId = useId();
  const pitch = useRef<SVGSVGElement>(null);
  const skin = usePitchSkin(pitch);
  const tap = (event: MouseEvent<SVGSVGElement>) => {
    const marked = (event.target as Element).closest('[data-label]');
    if (marked) return setNote({ text: marked.getAttribute('data-label')! });
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const cell = cellAt(
      ((event.clientX - box.left) / box.width) * VIEW.width,
      ((event.clientY - box.top) / box.height) * VIEW.height,
    );
    setNote(cell === undefined ? undefined : { cell, text: describe?.(cell) ?? cellName(cell) });
  };
  const stripe = FIELD.width / 10;
  return (
    <figure className={s.figure}>
      <svg
        ref={pitch}
        className={s.pitch}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label={label}
        onClick={tap}
        data-testid="material-pitch"
      >
        <rect className={s.grass} width={VIEW.width} height={VIEW.height} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            className={i % 2 ? s.stripe : s.stripeAlt}
            x={FIELD.x + stripe * i}
            y={FIELD.y}
            width={stripe + 0.2}
            height={FIELD.height}
          />
        ))}
        {skin.textureUrl && (
          <>
            <defs>
              <pattern
                id={groundId}
                width={skin.textureSize / 4}
                height={skin.textureSize / 4}
                patternUnits="userSpaceOnUse"
              >
                <image
                  href={skin.textureUrl}
                  width={skin.textureSize / 4}
                  height={skin.textureSize / 4}
                />
              </pattern>
            </defs>
            <rect
              width={VIEW.width}
              height={VIEW.height}
              fill={`url(#${groundId})`}
              opacity={skin.textureOpacity}
              pointerEvents="none"
            />
          </>
        )}
        {cells?.map((c) => (
          <rect
            key={c.cell}
            className={s.heat}
            x={c.x}
            y={c.y}
            width={c.width}
            height={c.height}
            fillOpacity={c.shade * 0.82}
          />
        ))}
        <Markings />
        <path
          className={s.arrow}
          d={`M ${VIEW.width - 30} 6 h 18 m -4 -2.5 l 4 2.5 l -4 2.5`}
          aria-hidden="true"
        />
        {children}
        {note?.cell !== undefined && (
          <rect className={s.picked} {...cellRect(note.cell)} pointerEvents="none" />
        )}
      </svg>
      <figcaption className={s.caption} aria-live="polite">
        {note?.text ?? '칸이나 표시를 누르면 이름과 기록이 보여요 · 오른쪽으로 공격'}
      </figcaption>
      {legend}
    </figure>
  );
}

function ShotMap({ record, w }: { record: MatchRecord; w: World }) {
  const dots = useMemo(() => shotDots(record, w), [record, w]);
  const own = ownSide(record, w);
  const mine = shotTotals(record, own),
    theirs = shotTotals(record, own === 0 ? 1 : 0);
  const totals = (t: typeof mine) => `슛 ${t.shots} · 골 ${t.goals} · xG ${t.xg.toFixed(2)}`;
  return (
    <MaterialPitch
      label={`슛 지도: 우리 ${totals(mine)}, 상대 ${totals(theirs)}`}
      legend={
        <ul className={s.legend}>
          <li>
            <i className={`${s.key} ${s.ownKey}`} /> 우리 {totals(mine)}
          </li>
          <li>
            <i className={`${s.key} ${s.otherKey}`} /> 상대 {totals(theirs)}
          </li>
          <li>크기 = xG · 채움 = 골 · 마름모 = 헤더 · 두 팀 모두 오른쪽으로 공격</li>
        </ul>
      }
    >
      {dots.map((dot, i) => {
        const className = `${s.shot} ${dot.own ? s.ownShot : s.otherShot} ${dot.goal ? s.goal : ''}`;
        return dot.header ? (
          <path
            key={i}
            className={className}
            data-testid="shot-dot"
            data-label={dot.label}
            d={`M ${dot.cx} ${dot.cy - dot.r * 1.2} L ${dot.cx + dot.r * 1.2} ${dot.cy} L ${dot.cx} ${
              dot.cy + dot.r * 1.2
            } L ${dot.cx - dot.r * 1.2} ${dot.cy} Z`}
          >
            <title>{dot.label}</title>
          </path>
        ) : (
          <circle
            key={i}
            className={className}
            data-testid="shot-dot"
            data-label={dot.label}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
          >
            <title>{dot.label}</title>
          </circle>
        );
      })}
    </MaterialPitch>
  );
}

function HeatMaps({ record, w }: { record: MatchRecord; w: World }) {
  const choices = useMemo(() => heatChoices(record, w), [record, w]);
  const [who, setWho] = useState('own');
  const map = heatOf(record, w, who);
  const cells = heatCells(map);
  const chosen = choices.find((c) => c.id === who)?.label ?? '우리 팀';
  return (
    <>
      <label className={s.picker}>
        히트맵 대상{' '}
        <Select aria-label="히트맵 대상" value={who} onValueChange={setWho}>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </label>
      <MaterialPitch
        label={`${chosen} 히트맵 · 터치 ${map?.touches ?? 0}번`}
        cells={cells}
        describe={(cell) => cells[cell]!.label}
        legend={
          <p className={s.caption}>
            {chosen} · 터치 {map?.touches ?? 0}번 · 진할수록 터치 비중이 커요
            {who === 'opponent' && ' · 상대도 오른쪽으로 공격'}
          </p>
        }
      />
    </>
  );
}

function Network({ record, w }: { record: MatchRecord; w: World }) {
  const view = useMemo(() => networkView(record, w), [record, w]);
  if (!view) return null;
  return (
    <MaterialPitch
      label={`패스 연결망: 우리 선수 ${view.nodes.length}명, 연결 ${view.links.length}개`}
      legend={
        <>
          <p className={s.caption}>
            점 = 평균 위치(크기는 터치) · 선 굵기 = 두 선수 사이 성공 패스(2번 이상)
          </p>
          <ol className={s.roster}>
            {view.nodes.map((n, i) => (
              <li key={n.line}>
                <b>{i + 1}</b> {n.label}
              </li>
            ))}
          </ol>
        </>
      }
    >
      {view.links.map((l) => (
        <line
          key={l.key}
          className={s.link}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          strokeWidth={l.width}
          data-label={l.label}
        >
          <title>{l.label}</title>
        </line>
      ))}
      {view.nodes.map((n, i) => (
        <g key={n.line} className={s.node} data-label={n.label}>
          <title>{n.label}</title>
          <circle cx={n.cx} cy={n.cy} r={n.r} />
          <text x={n.cx} y={n.cy} dy="0.36em">
            {i + 1}
          </text>
        </g>
      ))}
    </MaterialPitch>
  );
}

function Report({ record, w }: { record: MatchRecord; w: World }) {
  const own = ownSide(record, w);
  const [side, setSide] = useState<'own' | 'opponent'>('own');
  const view = sideReport(record, side === 'own' ? own : own === 0 ? 1 : 0);
  if (!view) return <p className={s.caption}>이 경기는 전술 해설을 기록하지 않았어요.</p>;
  const most = Math.max(1, ...view.lanes.map((l) => l.entries));
  const length = px(PITCH.length) - px(BAND_EDGES[5]);
  return (
    <>
      <Segments
        label="전술 해설 팀"
        options={[
          ['own', '우리 팀'],
          ['opponent', '상대 팀'],
        ]}
        value={side}
        onChange={setSide}
      />
      <ul className={s.sentences}>
        {view.sentences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <MaterialPitch
        label={`레인별 파이널 서드 진입: ${view.lanes.map((l) => `${l.label} ${l.entries}`).join(', ')}`}
        legend={<p className={s.caption}>막대 = 레인별 파이널 서드 진입(괄호는 박스 진입)</p>}
      >
        <line
          className={s.thirdLine}
          x1={px(BAND_EDGES[5])}
          x2={px(BAND_EDGES[5])}
          y1={FIELD.y}
          y2={FIELD.y + FIELD.height}
        />
        {view.lanes.map((lane, i) => {
          const y0 = py(LANE_EDGES[i]!),
            y1 = py(LANE_EDGES[i + 1]!);
          const label = `${lane.label} · 파이널 서드 진입 ${lane.entries}번 · 박스 진입 ${lane.box}번`;
          return (
            <g key={lane.label} data-label={label}>
              <title>{label}</title>
              <rect
                className={s.bar}
                x={px(BAND_EDGES[5])}
                y={y0 + (y1 - y0) * 0.2}
                width={Math.max(0.6, (length * lane.entries) / most)}
                height={(y1 - y0) * 0.6}
              />
              <text className={s.barText} x={px(BAND_EDGES[5]) - 2} y={(y0 + y1) / 2} dy="0.36em">
                {lane.entries}({lane.box})
              </text>
            </g>
          );
        })}
      </MaterialPitch>
      <table className={s.thirds}>
        <caption>지역별 공 되찾기·잃기 (오른쪽으로 공격 기준)</caption>
        <thead>
          <tr>
            <th scope="col" />
            {view.regains.map((t) => (
              <th key={t.label} scope="col">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">되찾기</th>
            {view.regains.map((t) => (
              <td key={t.label}>{t.count}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">잃기</th>
            {view.losses.map((t) => (
              <td key={t.label}>{t.count}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  );
}
