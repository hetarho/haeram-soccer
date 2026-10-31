import type { ReactNode } from 'react';
import type { Personality } from '../../../../packages/contracts/src/player';
import type { Player, World } from '../../../../packages/contracts/src/types';
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  PERSONALITY_LABEL,
  POSITION_LABEL,
  TRAIT_LABEL,
} from '../../../../packages/engine/src/player';
import { clubOf, overall } from '../../../../packages/engine/src/player-state';
import { staffMember } from '../../../../packages/engine/src/staff-info';
import { positionsLabel } from './FormationPitch';
import { Money } from './Money';
import { OvrBadge } from './OvrBadge';
import { gradeLabel } from './PlayerProfile';
import s from './PlayerCompare.module.css';

/** One side of a comparison: a market candidate with its terms, or a player of ours. */
export type CompareSide = {
  label: string;
  player: Player;
  own: boolean;
  /** Market terms; a player of ours has none. */
  terms?: {
    fee: string;
    loanFee: string;
    freeAgent: boolean;
    cashAfter: string;
    annualAfter: string;
  };
  /** Shown under the side's name, e.g. the way into its detail. */
  action?: ReactNode;
};

type Better = 'higher' | 'lower' | undefined;
type Cell = { text: ReactNode; value?: number | bigint };
type Row = { label: string; cells: readonly [Cell, Cell]; better?: Better; bars?: boolean };

/** Which side reads better on a row, if the row has a direction and the values differ. */
function winner(row: Row): 0 | 1 | undefined {
  const [a, b] = row.cells.map((cell) => cell.value);
  if (!row.better || a === undefined || b === undefined || a === b) return;
  return a > b === (row.better === 'higher') ? 0 : 1;
}

/**
 * Two players side by side on every width (→WEB-25): each row names its measure in the middle
 * with one player's value on each side; the better value is marked and attributes meet as mirrored
 * bars. Values are the same facts the detail shows, never a combined score.
 */
export function PlayerCompare({
  w,
  sides,
  label,
}: {
  w: World;
  sides: readonly [CompareSide, CompareSide];
  label: string;
}) {
  const club = clubOf(w);
  const scout = staffMember(w, 'scout')?.ability;
  const cash = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const both = (read: (side: CompareSide) => Cell): readonly [Cell, Cell] => [
    read(sides[0]),
    read(sides[1]),
  ];
  const growth = (player: Player) => Math.max(0, Math.round(player.potential) - overall(player));
  const money = (
    read: (terms: NonNullable<CompareSide['terms']>) => string,
    better: Better,
  ): Omit<Row, 'label'> => ({
    cells: both((side) =>
      side.terms
        ? { text: cash(read(side.terms)), value: BigInt(read(side.terms)) }
        : { text: '—' },
    ),
    better,
  });
  const groups: { title: string; rows: Row[]; note?: string }[] = [
    {
      title: '핵심',
      rows: [
        {
          label: 'OVR',
          cells: both((side) => ({ text: overall(side.player), value: overall(side.player) })),
          better: 'higher',
        },
        {
          label: '잠재력',
          cells: both((side) => ({
            text: Math.round(side.player.potential),
            value: Math.round(side.player.potential),
          })),
          better: 'higher',
        },
        {
          label: '성장 여지',
          cells: both((side) => ({
            text: `+${growth(side.player)}`,
            value: growth(side.player),
          })),
          better: 'higher',
        },
        {
          label: '나이',
          cells: both((side) => ({ text: `${w.year - side.player.born}세` })),
        },
        {
          label: '포지션',
          cells: both((side) => ({ text: positionsLabel(side.player.positions) })),
        },
      ],
    },
  ];
  if (sides.some((side) => side.terms))
    groups.push({
      title: '조건',
      note: '영입 후 연간 고정 지출은 새 연봉 포함, 미래 수입 제외예요.',
      rows: [
        {
          label: '이적료',
          better: 'lower',
          cells: both((side) =>
            side.terms
              ? {
                  text: side.terms.freeAgent ? '자유계약' : cash(side.terms.fee),
                  value: BigInt(side.terms.fee),
                }
              : { text: '—' },
          ),
        },
        { label: '1시즌 임대료', ...money((terms) => terms.loanFee, 'lower') },
        {
          label: '연봉',
          cells: both((side) => ({
            text: cash(side.player.wage),
            value: BigInt(side.player.wage),
          })),
          better: 'lower',
        },
        { label: '계약', cells: both((side) => ({ text: `${side.player.until}년까지` })) },
        { label: '영입 후 자금', ...money((terms) => terms.cashAfter, 'higher') },
        { label: '연간 고정 지출', ...money((terms) => terms.annualAfter, 'lower') },
      ],
    });
  else
    groups[0].rows.push({
      label: '연봉',
      cells: both((side) => ({ text: cash(side.player.wage), value: BigInt(side.player.wage) })),
      better: 'lower',
    });
  for (const group of ATTRIBUTE_GROUPS)
    groups.push({
      title: group.label,
      rows: group.attributes.map((attribute) => ({
        label: ATTRIBUTE_LABEL[attribute],
        cells: both((side) => {
          const value = Math.round(side.player.attrs[attribute]);
          return { text: value, value };
        }),
        better: 'higher',
        bars: true,
      })),
    });
  groups.push({
    title: '특성 · 성향',
    note: sides.some((side) => !side.own)
      ? '상대 선수 성향은 수석 스카우트가 본 범위예요.'
      : undefined,
    rows: [
      {
        label: '플레이 특성',
        cells: both((side) => ({
          text: side.player.traits.length
            ? side.player.traits.map((trait) => TRAIT_LABEL[trait]).join(' · ')
            : '없음',
        })),
      },
      ...(Object.keys(PERSONALITY_LABEL) as (keyof Personality)[]).map((key) => ({
        label: PERSONALITY_LABEL[key],
        cells: both((side) => ({
          text: gradeLabel(side.player.personality[key], side.own, scout),
        })),
      })),
    ],
  });
  return (
    <section className={s.compare} aria-label={label}>
      <div className={s.heads}>
        {sides.map((side, index) => (
          <article
            key={side.player.id}
            data-surface="detail"
            className={s.head}
            data-side={index ? 'right' : 'left'}
            data-candidate-id={side.own ? undefined : side.player.id}
          >
            <span data-ui="label" className={s.sideLabel} data-own={side.own || undefined}>
              {side.label}
            </span>
            <OvrBadge value={overall(side.player)} role={side.player.position} large />
            <h3>{side.player.name}</h3>
            <small>
              {side.player.position} · {POSITION_LABEL[side.player.position]} ·{' '}
              {w.year - side.player.born}세
            </small>
            {side.action}
          </article>
        ))}
        <span className={s.versus} aria-hidden="true">
          VS
        </span>
      </div>
      {groups.map((group) => (
        <table key={group.title} className={s.table}>
          <caption>{group.title}</caption>
          <thead className={s.hidden}>
            <tr>
              <th scope="col">{sides[0].player.name}</th>
              <th scope="col">항목</th>
              <th scope="col">{sides[1].player.name}</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => {
              const best = winner(row);
              return (
                <tr key={row.label}>
                  {row.cells.map((cell, index) => {
                    const td = (
                      <td
                        key={index}
                        data-side={index ? 'right' : 'left'}
                        data-better={best === index || undefined}
                      >
                        {row.bars && typeof cell.value === 'number' ? (
                          <span className={s.bar}>
                            <b>{cell.text}</b>
                            <span className={s.track} aria-hidden="true">
                              <i style={{ width: `${Math.max(2, Math.min(100, cell.value))}%` }} />
                            </span>
                          </span>
                        ) : (
                          <b>{cell.text}</b>
                        )}
                      </td>
                    );
                    return index === 0
                      ? [
                          td,
                          <th key="label" scope="row">
                            {row.label}
                          </th>,
                        ]
                      : td;
                  })}
                </tr>
              );
            })}
          </tbody>
          {group.note && (
            <tfoot>
              <tr>
                <td colSpan={3}>{group.note}</td>
              </tr>
            </tfoot>
          )}
        </table>
      ))}
    </section>
  );
}
