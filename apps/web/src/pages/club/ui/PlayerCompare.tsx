import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { ReactNode } from 'react';
import type { Personality } from '../../../../../../packages/contracts/src/player';
import type { Player, World } from '../../../../../../packages/contracts/src/types';
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  PERSONALITY_LABEL,
  POSITION_LABEL,
  TRAIT_LABEL,
} from '../../../../../../packages/engine/src/player';
import { overall } from '../../../../../../packages/engine/src/player-state';
import { staffMember } from '../../../../../../packages/engine/src/staff-info';
import { scoutRangeScale } from '../../../../../../packages/engine/src/owner-traits';
import { positionsLabel } from '../../../entities/player';
import { marketMoneyContext, sameMarketMoney, type MarketMoney } from '../lib/worldMarket';
import { Money } from '../../../shared/ui/Money';
import { OvrBadge } from '../../../entities/player';
import { gradeLabel } from '../../../entities/player';
import s from './PlayerCompare.module.css';

/** One side of a comparison: a market candidate with its terms, or a player of ours. */
export type CompareSide = {
  label: string;
  player: Player;
  own: boolean;
  /** Omitted for live own-player consumers; null explicitly withholds unresolved snapshot money. */
  money?: MarketMoney | null;
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
  useTextLocale();
  const scout = staffMember(w, 'scout')?.ability;
  const range = scoutRangeScale(w);
  const currentMoney = marketMoneyContext(w)!;
  const context = (side: CompareSide) => (side.money === undefined ? currentMoney : side.money);
  const comparable = sameMarketMoney(context(sides[0]), context(sides[1]));
  const cash = (side: CompareSide, value: string, projected = false): Cell => {
    const money = context(side);
    if (!money || (projected && !sameMarketMoney(money, currentMoney)))
      return { text: sourceMessage('copy.RecruitmentDesk.414f13ede8') };
    return {
      text: <Money value={value} code={money.code} year={money.year} />,
      value: comparable ? BigInt(value) : undefined,
    };
  };
  const both = (read: (side: CompareSide) => Cell): readonly [Cell, Cell] => [
    read(sides[0]),
    read(sides[1]),
  ];
  const growth = (player: Player) => Math.max(0, Math.round(player.potential) - overall(player));
  const money = (
    read: (terms: NonNullable<CompareSide['terms']>) => string,
    better: Better,
    projected = false,
  ): Omit<Row, 'label'> => ({
    cells: both((side) => (side.terms ? cash(side, read(side.terms), projected) : { text: '—' })),
    better,
  });
  const groups: { title: string; rows: Row[]; note?: string }[] = [
    {
      title: sourceMessage('copy.PlayerCompare.2667257de7'),
      rows: [
        {
          label: 'OVR',
          cells: both((side) => ({ text: overall(side.player), value: overall(side.player) })),
          better: 'higher',
        },
        {
          label: sourceMessage('copy.AssigneeProfile.ad725da0ea'),
          cells: both((side) => ({
            text: Math.round(side.player.potential),
            value: Math.round(side.player.potential),
          })),
          better: 'higher',
        },
        {
          label: sourceMessage('copy.PlayerCompare.520962add0'),
          cells: both((side) => ({
            text: `+${growth(side.player)}`,
            value: growth(side.player),
          })),
          better: 'higher',
        },
        {
          label: sourceMessage('team.column.age'),
          cells: both((side) => ({
            text: sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: w.year - side.player.born }),
          })),
        },
        {
          label: sourceMessage('copy.BallonDorView.cb34c0f691'),
          cells: both((side) => ({ text: positionsLabel(side.player.positions) })),
        },
      ],
    },
  ];
  if (sides.some((side) => side.terms))
    groups.push({
      title: sourceMessage('copy.PlayerCompare.291ac97193'),
      note: sourceMessage('copy.PlayerCompare.e7ffaa54c7'),
      rows: [
        {
          label: sourceMessage('copy.EventCenter.e2d73c6cf3'),
          better: 'lower',
          cells: both((side) =>
            side.terms
              ? {
                  ...cash(side, side.terms.fee),
                  ...(side.terms.freeAgent && context(side)
                    ? { text: sourceMessage('copy.PlayerCompare.f201ec1d4f') }
                    : {}),
                }
              : { text: '—' },
          ),
        },
        {
          label: sourceMessage('copy.PlayerCompare.e0e9003294'),
          ...money((terms) => terms.loanFee, 'lower'),
        },
        {
          label: sourceMessage('team.column.wage'),
          cells: both((side) => cash(side, side.player.wage)),
          better: 'lower',
        },
        {
          label: sourceMessage('team.column.contract'),
          cells: both((side) => ({
            text: sourceMessage('copy.PlayerCompare.9b59bc9f85', { p0: side.player.until }),
          })),
        },
        {
          label: sourceMessage('copy.PlayerCompare.8933209ede'),
          ...money((terms) => terms.cashAfter, 'higher', true),
        },
        {
          label: sourceMessage('copy.BusinessWorkbench.d69ab3db74'),
          ...money((terms) => terms.annualAfter, 'lower', true),
        },
      ],
    });
  else
    groups[0].rows.push({
      label: sourceMessage('team.column.wage'),
      cells: both((side) => cash(side, side.player.wage)),
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
    title: sourceMessage('copy.PlayerCompare.22705afbae'),
    note: sides.some((side) => !side.own)
      ? sourceMessage('copy.PlayerCompare.cfd9898d43')
      : undefined,
    rows: [
      {
        label: sourceMessage('copy.PlayerCompare.2e0c7616cd'),
        cells: both((side) => ({
          text: side.player.traits.length
            ? side.player.traits.map((trait) => TRAIT_LABEL[trait]).join(' · ')
            : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
        })),
      },
      ...(Object.keys(PERSONALITY_LABEL) as (keyof Personality)[]).map((key) => ({
        label: PERSONALITY_LABEL[key],
        cells: both((side) => ({
          text: gradeLabel(side.player.personality[key], side.own, scout, range),
        })),
      })),
    ],
  });
  return (
    <section className={s.compare} aria-label={localizeValue(label)}>
      <div className={s.heads}>
        {localizeValue(
          sides.map((side, index) => (
            <article
              key={side.player.id}
              data-surface="detail"
              className={s.head}
              data-side={index ? 'right' : 'left'}
              data-candidate-id={side.own ? undefined : side.player.id}
            >
              <span data-ui="label" className={s.sideLabel} data-own={side.own || undefined}>
                {localizeValue(side.label)}
              </span>
              <OvrBadge value={overall(side.player)} role={side.player.position} large />
              <h3>{side.player.name}</h3>
              <small>
                {richMessage('copy.PlayerCompare.661179378f', {
                  p0: side.player.position,
                  p1: POSITION_LABEL[side.player.position],
                  p2: ' ',
                  p3: w.year - side.player.born,
                })}
              </small>
              {localizeValue(side.action)}
            </article>
          )),
        )}
        <span className={s.versus} aria-hidden="true">
          {richMessage('copy.PlayerCompare.8db1a2e199')}
        </span>
      </div>
      {localizeValue(
        groups.map((group) => (
          <table key={group.title} className={s.table}>
            <caption>{localizeValue(group.title)}</caption>
            <thead className={s.hidden}>
              <tr>
                <th scope="col">{sides[0].player.name}</th>
                <th scope="col">{richMessage('copy.LabPage.962f286b14')}</th>
                <th scope="col">{sides[1].player.name}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                group.rows.map((row) => {
                  const best = winner(row);
                  return (
                    <tr key={row.label}>
                      {localizeValue(
                        row.cells.map((cell, index) => {
                          const td = (
                            <td
                              key={index}
                              data-side={index ? 'right' : 'left'}
                              data-better={best === index || undefined}
                            >
                              {localizeValue(
                                row.bars && typeof cell.value === 'number' ? (
                                  <span className={s.bar}>
                                    <b>{localizeValue(cell.text)}</b>
                                    <span className={s.track} aria-hidden="true">
                                      <i
                                        style={{
                                          width: `${Math.max(2, Math.min(100, cell.value))}%`,
                                        }}
                                      />
                                    </span>
                                  </span>
                                ) : (
                                  <b>{localizeValue(cell.text)}</b>
                                ),
                              )}
                            </td>
                          );
                          return index === 0
                            ? [
                                td,
                                <th key="label" scope="row">
                                  {localizeValue(row.label)}
                                </th>,
                              ]
                            : td;
                        }),
                      )}
                    </tr>
                  );
                }),
              )}
            </tbody>
            {localizeValue(
              group.note && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>{localizeValue(group.note)}</td>
                  </tr>
                </tfoot>
              ),
            )}
          </table>
        )),
      )}
    </section>
  );
}
