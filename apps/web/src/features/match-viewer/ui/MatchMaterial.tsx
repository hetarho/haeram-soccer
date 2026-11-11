import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import { BAND_EDGES, LANE_EDGES, PITCH } from '../../../../../../packages/engine/src/grid/pitch';
import { FIELD, HeatPitch, MaterialPitch } from '../../../entities/match';
import {
  heatChoices,
  heatOf,
  networkView,
  NETWORK_VIEW,
  matchLook,
  ownSide,
  px,
  py,
  shotDots,
  shotTotals,
  sideReport,
  topToucher,
} from '../../../entities/match';
import { number } from '../../../presentation/format';
import { scoreboardHalves } from '../lib/scoreboardHalves';
import networkStyle from './PassNetwork.module.css';
import { TabList } from '../../../shared/ui/PageTabs';
import { openPlayer } from '../../../entities/player';
import { Segments } from '../../../shared/ui/Segments';
import { Select } from '../../../shared/ui/Select';
import s from '../../../shared/ui/styles/MatchMaterial.module.css';
import app from '../../../shared/ui/styles/App.module.css';

type Tab = 'shots' | 'heat' | 'network' | 'report';
const TABS = [
  ['shots', sourceMessage('copy.MatchMaterial.4783334a0f')],
  ['heat', sourceMessage('copy.MatchMaterial.c1fc5bb4a0')],
  ['network', sourceMessage('copy.MatchMaterial.db54860add')],
  ['report', sourceMessage('copy.MatchMaterial.4932b1af38')],
] as const;

/**
 * An own match's post-match material (→WEB-84, MATCH-25): shot map, heat maps, pass network and
 * tactical report, each on the theatre's 1.9:1 pitch. Loaded lazily, outside the entry (→ARCH-28).
 */
export function MatchMaterial({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const [tab, setTab] = useState<Tab>('shots');
  const id = `material-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!record.material) {
    const top = topToucher(record, w);
    return (
      <section className={s.material} aria-label={displayMessage('copy.stories.a3b55318c6')}>
        <p data-surface="inset" className={s.missing} role="status">
          {richMessage('copy.MatchMaterial.d12e529078')}
        </p>
        {localizeValue(
          top && (
            <p className={s.caption}>
              {richMessage('copy.MatchMaterial.6a8d34feb6', {
                p0: ' ',
                p1: (
                  <button
                    type="button"
                    className={s.playerLink}
                    aria-label={displayMessage('copy.MatchMaterial.1a923aba55', { p0: top.name })}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      openPlayer({ id: top.id });
                    }}
                  >
                    {top.name}
                  </button>
                ),
              })}
            </p>
          ),
        )}
      </section>
    );
  }
  return (
    <section className={s.material} aria-label={displayMessage('copy.stories.a3b55318c6')}>
      <TabList
        tabs={TABS}
        value={tab}
        onChange={setTab}
        label={displayMessage('copy.MatchMaterial.1d3ede7cc3')}
        idPrefix={id}
        className={app.seasonTabs}
      />
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
        {localizeValue(tab === 'shots' && <ShotMap record={record} w={w} />)}
        {localizeValue(tab === 'heat' && <HeatMaps record={record} w={w} />)}
        {localizeValue(tab === 'network' && <Network record={record} w={w} />)}
        {localizeValue(tab === 'report' && <Report record={record} w={w} />)}
      </div>
    </section>
  );
}

function ShotMap({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const dots = useMemo(() => shotDots(record, w), [record, w]);
  const own = ownSide(record, w);
  const mine = shotTotals(record, own),
    theirs = shotTotals(record, own === 0 ? 1 : 0);
  const totals = (t: typeof mine) =>
    sourceMessage('copy.MatchMaterial.6b3044f0d7', {
      p0: t.shots,
      p1: t.goals,
      p2: t.xg.toFixed(2),
    });
  return (
    <MaterialPitch
      label={displayMessage('copy.MatchMaterial.7dec06e088', {
        p0: totals(mine),
        p1: totals(theirs),
      })}
      legend={
        <ul className={s.legend}>
          <li>
            {richMessage('copy.MatchMaterial.9da7983267', {
              p0: <i className={`${s.key} ${s.ownKey}`} />,
              p1: totals(mine),
            })}
          </li>
          <li>
            {richMessage('copy.MatchMaterial.870b086e6f', {
              p0: <i className={`${s.key} ${s.otherKey}`} />,
              p1: totals(theirs),
            })}
          </li>
          <li>{richMessage('copy.MatchMaterial.cf5a470964')}</li>
        </ul>
      }
    >
      {localizeValue(
        dots.map((dot, i) => {
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
              <title>{localizeValue(dot.label)}</title>
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
              <title>{localizeValue(dot.label)}</title>
            </circle>
          );
        }),
      )}
    </MaterialPitch>
  );
}

function HeatMaps({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const choices = useMemo(() => heatChoices(record, w), [record, w]);
  const [who, setWho] = useState('own');
  const map = useMemo(() => heatOf(record, w, who), [record, w, who]);
  const chosen =
    choices.find((c) => c.id === who)?.label ?? sourceMessage('copy.BallonDorView.8434ac1486');
  return (
    <>
      <label className={s.picker}>
        {richMessage('copy.MatchMaterial.caf76bdaa3', {
          p0: ' ',
          p1: (
            <Select
              aria-label={displayMessage('copy.MatchMaterial.c4df6fb3de')}
              value={who}
              onValueChange={setWho}
            >
              {localizeValue(
                choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {localizeValue(c.label)}
                  </option>
                )),
              )}
            </Select>
          ),
        })}
      </label>
      <HeatPitch
        map={map}
        label={displayMessage('copy.MatchMaterial.bbb9a18045', {
          p0: chosen,
          p1: map?.touches ?? 0,
        })}
        legend={
          <p className={s.caption}>
            {richMessage('copy.MatchMaterial.4ea1afd010', {
              p0: chosen,
              p1: map?.touches ?? 0,
              p2: who === 'opponent' && sourceMessage('copy.MatchMaterial.3acc063cd8'),
            })}
          </p>
        }
      />
    </>
  );
}

function Network({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const view = useMemo(() => networkView(record, w), [record, w]);
  const arrow = `network-arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!view) return null;
  const kit = scoreboardHalves(matchLook(record))[ownSide(record, w)];
  const nodes = new Map(view.nodes.map((node) => [node.line, node]));
  const name = (line: number) =>
    nodes.get(line)?.name ??
    displayMessage('copy.materialView.921afb8470', { p0: number(line + 1) });
  const nodeLabel = (node: (typeof view.nodes)[number]) =>
    displayMessage('copy.materialView.38aeab08e9', {
      player: name(node.line),
      number: number(node.number),
      passes: number(node.passes),
      touches: number(node.touches),
    });
  const pairLabel = (link: (typeof view.links)[number]) =>
    displayMessage('copy.materialView.9e20aac524', {
      from: name(link.from),
      to: name(link.to),
      forward: number(link.forward),
      backward: number(link.backward),
    });
  const labels = new Map<string, string>([
    ...view.nodes.map((node) => [`node-${node.line}`, nodeLabel(node)] as const),
    ...view.links.map((link) => [`pair-${link.key}`, pairLabel(link)] as const),
  ]);
  return (
    <MaterialPitch
      label={displayMessage('copy.MatchMaterial.2a1cc2e03e', {
        p0: number(view.nodes.length),
        p1: number(view.links.length),
      })}
      describeMark={(key) => labels.get(key) ?? ''}
      legend={
        <>
          <p className={s.caption}>
            {richMessage('copy.MatchMaterial.e86b9ed7bd', {
              minPasses: number(NETWORK_VIEW.minPasses),
            })}
          </p>
          <ol className={s.roster}>
            {view.nodes.map((node) => (
              <li key={node.line}>{nodeLabel(node)}</li>
            ))}
          </ol>
          <p className={s.caption}>{richMessage('match.network.busiest')}</p>
          <ol className={s.roster} aria-label={displayMessage('match.network.busiest')}>
            {view.busiest.map((link) => (
              <li key={link.key}>{pairLabel(link)}</li>
            ))}
          </ol>
        </>
      }
    >
      <defs>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path className={networkStyle.arrowhead} d="M 0 0 L 10 5 L 0 10 Z" />
        </marker>
      </defs>
      <g
        className={networkStyle.network}
        style={
          {
            '--network-shirt': kit.background,
            '--network-ink': kit.ink,
          } as CSSProperties
        }
      >
        {view.links.map((link) => (
          <g
            key={link.key}
            role="button"
            tabIndex={0}
            className={networkStyle.link}
            aria-label={pairLabel(link)}
            data-label={pairLabel(link)}
            data-mark={`pair-${link.key}`}
            data-network-link
          >
            <title>{pairLabel(link)}</title>
            <line
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              strokeWidth={link.width}
              markerStart={link.arrowStart ? `url(#${arrow})` : undefined}
              markerEnd={link.arrowEnd ? `url(#${arrow})` : undefined}
            />
            <line
              className={networkStyle.hit}
              aria-hidden="true"
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              strokeWidth="44"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
        {view.nodes.map((node) => (
          <g
            key={node.line}
            className={networkStyle.node}
            role="button"
            tabIndex={0}
            aria-label={nodeLabel(node)}
            data-label={nodeLabel(node)}
            data-mark={`node-${node.line}`}
            data-network-node
          >
            <title>{nodeLabel(node)}</title>
            <circle
              className={networkStyle.hit}
              aria-hidden="true"
              cx={node.cx}
              cy={node.cy}
              r={node.r}
              strokeWidth="44"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={node.cx} cy={node.cy} r={node.r} />
            <text x={node.cx} y={node.cy} dy="0.36em">
              {number(node.number)}
            </text>
          </g>
        ))}
      </g>
    </MaterialPitch>
  );
}

function Report({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const own = ownSide(record, w);
  const [side, setSide] = useState<'own' | 'opponent'>('own');
  const view = sideReport(record, side === 'own' ? own : own === 0 ? 1 : 0);
  if (!view) return <p className={s.caption}>{richMessage('copy.MatchMaterial.f7e6dbe02f')}</p>;
  const most = Math.max(1, ...view.lanes.map((l) => l.entries));
  const length = px(PITCH.length) - px(BAND_EDGES[5]);
  return (
    <>
      <Segments
        label={displayMessage('copy.MatchMaterial.ff24187b5b')}
        options={[
          ['own', sourceMessage('copy.BallonDorView.8434ac1486')],
          ['opponent', sourceMessage('copy.MatchBriefing.1a46398092')],
        ]}
        value={side}
        onChange={setSide}
      />
      <ul className={s.sentences}>
        {localizeValue(view.sentences.map((line) => <li key={line}>{localizeValue(line)}</li>))}
      </ul>
      <MaterialPitch
        label={displayMessage('copy.MatchMaterial.bd972e8fc6', {
          p0: view.lanes.map((l) => `${l.label} ${l.entries}`).join(', '),
        })}
        legend={<p className={s.caption}>{richMessage('copy.MatchMaterial.636103a009')}</p>}
      >
        <line
          className={s.thirdLine}
          x1={px(BAND_EDGES[5])}
          x2={px(BAND_EDGES[5])}
          y1={FIELD.y}
          y2={FIELD.y + FIELD.height}
        />
        {localizeValue(
          view.lanes.map((lane, i) => {
            const y0 = py(LANE_EDGES[i]!),
              y1 = py(LANE_EDGES[i + 1]!);
            const label = sourceMessage('copy.MatchMaterial.0758648940', {
              p0: lane.label,
              p1: lane.entries,
              p2: lane.box,
            });
            return (
              <g key={lane.label} data-label={label}>
                <title>{localizeValue(label)}</title>
                <rect
                  className={s.bar}
                  x={px(BAND_EDGES[5])}
                  y={y0 + (y1 - y0) * 0.2}
                  width={Math.max(0.6, (length * lane.entries) / most)}
                  height={(y1 - y0) * 0.6}
                />
                <text className={s.barText} x={px(BAND_EDGES[5]) - 2} y={(y0 + y1) / 2} dy="0.36em">
                  {localizeValue(lane.entries)}({localizeValue(lane.box)})
                </text>
              </g>
            );
          }),
        )}
      </MaterialPitch>
      <table className={s.thirds}>
        <caption>{richMessage('copy.MatchMaterial.5e76ad2114')}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {localizeValue(
              view.regains.map((t) => (
                <th key={t.label} scope="col">
                  {localizeValue(t.label)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{richMessage('copy.MatchMaterial.56c5361e6e')}</th>
            {localizeValue(
              view.regains.map((t) => <td key={t.label}>{localizeValue(t.count)}</td>),
            )}
          </tr>
          <tr>
            <th scope="row">{richMessage('copy.MatchMaterial.447e3db7c9')}</th>
            {localizeValue(view.losses.map((t) => <td key={t.label}>{localizeValue(t.count)}</td>))}
          </tr>
        </tbody>
      </table>
    </>
  );
}
