import { useState } from 'react';
import type { Fixture, KnockoutRound, World } from '../../../../packages/contracts/src/types';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { legsOf } from '../../../../packages/engine/src/knockout';
import { tieAggregate } from '../../../../packages/engine/src/competition-keys';
import { treeColumns, treeStart, type Slot } from './bracketTree';
import { ClubLink } from './ClubLink';
import c from './CupsView.module.css';

/** A club in a tie, table or final: its crest and name open its team sheet. */
export function Club({ w, id, strong }: { w: World; id: string; strong?: boolean }) {
  return (
    <ClubLink
      w={w}
      id={id}
      className={`${c.club} ${strong ? c.strong : ''} ${id === w.playerClub ? c.ownName : ''}`}
    />
  );
}

/** The knockout of one competition; `year` reaches a closed season's fixtures. */
interface BracketProps {
  w: World;
  rounds: KnockoutRound[];
  fixtures: Fixture[];
  competition: string;
  year?: number;
}

/** A fixture's date without its year. */
const day = (w: World, f: Fixture) => fixtureDate(w, f).replace(/^\d+년 /, '');

/** When a round plays: both legs of a two-legged round, otherwise its one match day. */
export function roundDates(w: World, legs: readonly Fixture[]) {
  return legs.length === 2
    ? `1차전 ${day(w, legs[0])} · 2차전 ${day(w, legs[1])}`
    : legs[0]
      ? `${day(w, legs[0])} · 단판`
      : '';
}

/** One tie: both legs' scores, the aggregate and how a level tie went through. */
function Tie({ w, tie, legs }: { w: World; tie: KnockoutRound['ties'][number]; legs: Fixture[] }) {
  const own = tie.home === w.playerClub || tie.away === w.playerClub;
  const played = legs.filter((f) => f.score);
  const [home, away] = tieAggregate(tie, legs);
  const score = played.length
    ? legs.length === 2
      ? `${played.map((f) => `${f.score!.home}–${f.score!.away}`).join(', ')}${played.length === 2 ? ` · 합계 ${home}–${away}` : ` · 2차전 ${day(w, legs[1])}`}`
      : `${home}–${away}`
    : legs.map((f) => day(w, f)).join(' · ');
  return (
    <li className={own ? c.ownTie : undefined}>
      <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
      <em>
        {score}
        {tie.decided === 'pens' && <small> 승부차기</small>}
        {tie.decided === 'away' && <small> 원정 다득점</small>}
      </em>
      <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
      {own && <i className={c.ownBadge}>우리 팀</i>}
    </li>
  );
}

function TreeTie({
  w,
  round,
  index,
  slot,
  fixtures,
  competition,
  year,
}: Omit<BracketProps, 'rounds'> & { round?: KnockoutRound; index?: number; slot: Slot }) {
  if (!slot || !round || index === undefined)
    return (
      <li className={c.treeEmpty}>
        {slot && 'bye' in slot ? <Club w={w} id={slot.bye} /> : '추첨 전'}
      </li>
    );
  if ('bye' in slot)
    return (
      <li className={c.treeTie}>
        <Club w={w} id={slot.bye} strong />
        <small>부전승</small>
      </li>
    );
  const tie = round.ties[slot.tie],
    legs = legsOf(w, fixtures, competition, index, slot.tie, year),
    played = legs.some((f) => f.score),
    [home, away] = tieAggregate(tie, legs),
    own = tie.home === w.playerClub || tie.away === w.playerClub;
  return (
    <li className={`${c.treeTie} ${own ? c.ownTie : ''}`}>
      <span>
        <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
        <em>{played ? home : ''}</em>
      </span>
      <span>
        <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
        <em>{played ? away : ''}</em>
      </span>
      {(tie.decided === 'pens' || tie.decided === 'away') && (
        <small>{tie.decided === 'pens' ? '승부차기' : '원정 다득점'}</small>
      )}
    </li>
  );
}

function BracketTree({ rounds, ...props }: BracketProps) {
  const columns = treeColumns(rounds);
  if (!columns)
    return (
      <p className={c.treeNote}>
        아직 초반 라운드예요. 32강부터 대진표가 채워지고, 지금은 목록에서 볼 수 있어요.
      </p>
    );
  return (
    <div className={c.tree} role="group" aria-label="대진표">
      {columns.map((column, col) => (
        <section key={`${column.label}-${col}`} className={c.treeColumn}>
          <h4>{column.label}</h4>
          <ul style={{ minHeight: `${columns[0].slots.length * 64}px` }}>
            {column.slots.map((slot, i) => (
              <TreeTie
                key={i}
                {...props}
                round={column.index === undefined ? undefined : rounds[column.index]}
                index={column.index}
                slot={slot}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A knockout as a tree or as rounds, latest first; long early rounds fold behind our tie. */
export function Bracket(props: BracketProps) {
  // The tree opens first once its first round (32 clubs or fewer) is drawn; mass early rounds
  // read better as a list.
  const [view, setView] = useState<'tree' | 'list'>(() =>
    treeStart(props.rounds) >= 0 ? 'tree' : 'list',
  );
  if (!props.rounds.length) return null;
  return (
    <>
      <div className={c.viewSwitch} role="group" aria-label="대진 보기">
        {(
          [
            ['tree', '대진표'],
            ['list', '라운드별'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'tree' ? <BracketTree {...props} /> : <RoundList {...props} />}
    </>
  );
}

/** Knockout rounds, latest first; long early rounds fold behind our tie. */
function RoundList({ w, rounds, fixtures, competition, year }: BracketProps) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!rounds.length) return null;
  return (
    <div className={c.bracket} aria-label="토너먼트 대진">
      {rounds
        .map((round, index) => ({ round, index }))
        .reverse()
        .map(({ round, index }) => {
          const decided = round.ties.filter((tie) => tie.winner).length;
          const long = round.ties.length > 8;
          const shown = long && !open[index];
          const ties = round.ties
            .map((tie, t) => ({ tie, t }))
            .filter(({ tie }) => !shown || tie.home === w.playerClub || tie.away === w.playerClub);
          const legs = legsOf(w, fixtures, competition, index, 0, year);
          return (
            <section key={index} className={c.round}>
              <header>
                <h4>{round.label}</h4>
                <span>
                  {roundDates(w, legs)} · {decided}/{round.ties.length} 경기 종료
                  {round.byes?.length ? ` · 부전승 ${round.byes.length}팀` : ''}
                </span>
              </header>
              <ul className={c.ties}>
                {ties.map(({ tie, t }) => (
                  <Tie
                    key={t}
                    w={w}
                    tie={tie}
                    legs={legsOf(w, fixtures, competition, index, t, year)}
                  />
                ))}
              </ul>
              {long && (
                <button
                  className={c.more}
                  onClick={() => setOpen({ ...open, [index]: !open[index] })}
                >
                  {shown ? `${round.label} ${round.ties.length}경기 모두 보기` : '접기'}
                </button>
              )}
            </section>
          );
        })}
    </div>
  );
}
