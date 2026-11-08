import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState } from 'react';
import type { Fixture, KnockoutRound, World } from '../../../../../../packages/contracts/src/types';
import { fixtureDate } from '../../../../../../packages/engine/src/calendar';
import { legsOf } from '../../../../../../packages/engine/src/knockout';
import { tieAggregate } from '../../../../../../packages/engine/src/competition-keys';
import { treeColumns, treeStart, type Slot } from '../lib/bracketTree';
import { ClubLink } from '../../../entities/club';
import c from './CupsView.module.css';

/** A club in a tie, table or final: its crest and name open its team sheet. */
export function Club({ w, id, strong }: { w: World; id: string; strong?: boolean }) {
  useTextLocale();
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
    ? sourceMessage('copy.Bracket.06fa0bba36', { p0: day(w, legs[0]), p1: day(w, legs[1]) })
    : legs[0]
      ? sourceMessage('copy.Bracket.c26f0d6c33', { p0: day(w, legs[0]) })
      : '';
}

/** One tie: both legs' scores, the aggregate and how a level tie went through. */
function Tie({ w, tie, legs }: { w: World; tie: KnockoutRound['ties'][number]; legs: Fixture[] }) {
  useTextLocale();
  const own = tie.home === w.playerClub || tie.away === w.playerClub;
  const played = legs.filter((f) => f.score);
  const [home, away] = tieAggregate(tie, legs);
  const score = played.length
    ? legs.length === 2
      ? `${played.map((f) => `${f.score!.home}–${f.score!.away}`).join(', ')}${played.length === 2 ? sourceMessage('copy.Bracket.ca72b0e85b', { p0: home, p1: away }) : sourceMessage('copy.Bracket.556df42cd6', { p0: day(w, legs[1]) })}`
      : `${home}–${away}`
    : legs.map((f) => day(w, f)).join(' · ');
  return (
    <li data-surface="inset" className={own ? c.ownTie : undefined}>
      <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
      <em>
        {localizeValue(score)}
        {localizeValue(
          tie.decided === 'pens' && <small>{richMessage('copy.Bracket.463f3eb323')}</small>,
        )}
        {localizeValue(
          tie.decided === 'away' && <small>{richMessage('copy.Bracket.1ab2a8672f')}</small>,
        )}
      </em>
      <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
      {localizeValue(
        own && (
          <i data-ui="badge" data-compact className={c.ownBadge}>
            {richMessage('copy.BallonDorView.8434ac1486')}
          </i>
        ),
      )}
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
  useTextLocale();
  if (!slot || !round || index === undefined)
    return (
      <li data-surface="inset" className={c.treeEmpty}>
        {localizeValue(
          slot && 'bye' in slot ? (
            <Club w={w} id={slot.bye} />
          ) : (
            sourceMessage('copy.Bracket.5a6df9e7e3')
          ),
        )}
      </li>
    );
  if ('bye' in slot)
    return (
      <li data-surface="inset" className={c.treeTie}>
        <Club w={w} id={slot.bye} strong />
        <small>{richMessage('copy.Bracket.4d4171dd10')}</small>
      </li>
    );
  const tie = round.ties[slot.tie],
    legs = legsOf(w, fixtures, competition, index, slot.tie, year),
    played = legs.some((f) => f.score),
    [home, away] = tieAggregate(tie, legs),
    own = tie.home === w.playerClub || tie.away === w.playerClub;
  return (
    <li data-surface="inset" className={`${c.treeTie} ${own ? c.ownTie : ''}`}>
      <span>
        <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
        <em>{localizeValue(played ? home : '')}</em>
      </span>
      <span>
        <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
        <em>{localizeValue(played ? away : '')}</em>
      </span>
      {localizeValue(
        (tie.decided === 'pens' || tie.decided === 'away') && (
          <small>
            {localizeValue(
              tie.decided === 'pens'
                ? sourceMessage('copy.headToHead.16fa957ea6')
                : sourceMessage('copy.Bracket.76f88f090f'),
            )}
          </small>
        ),
      )}
    </li>
  );
}

function BracketTree({ rounds, ...props }: BracketProps) {
  useTextLocale();
  const columns = treeColumns(rounds);
  if (!columns) return <p className={c.treeNote}>{richMessage('copy.Bracket.dd2d16b95d')}</p>;
  return (
    <div className={c.tree} role="group" aria-label={displayMessage('copy.Bracket.b87f5164e1')}>
      {localizeValue(
        columns.map((column, col) => (
          <section key={`${column.label}-${col}`} className={c.treeColumn}>
            <h4>{localizeValue(column.label)}</h4>
            <ul style={{ minHeight: `${columns[0].slots.length * 64}px` }}>
              {localizeValue(
                column.slots.map((slot, i) => (
                  <TreeTie
                    key={i}
                    {...props}
                    round={column.index === undefined ? undefined : rounds[column.index]}
                    index={column.index}
                    slot={slot}
                  />
                )),
              )}
            </ul>
          </section>
        )),
      )}
    </div>
  );
}

/** A knockout as a tree or as rounds, latest first; long early rounds fold behind our tie. */
export function Bracket(props: BracketProps) {
  useTextLocale();
  // The tree opens first once its first round (32 clubs or fewer) is drawn; mass early rounds
  // read better as a list.
  const [view, setView] = useState<'tree' | 'list'>(() =>
    treeStart(props.rounds) >= 0 ? 'tree' : 'list',
  );
  if (!props.rounds.length) return null;
  return (
    <>
      <div
        className={c.viewSwitch}
        role="group"
        aria-label={displayMessage('copy.Bracket.b8dd6f3a49')}
      >
        {localizeValue(
          (
            [
              ['tree', sourceMessage('copy.Bracket.b87f5164e1')],
              ['list', sourceMessage('copy.Bracket.a284ae5d54')],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
              {localizeValue(label)}
            </button>
          )),
        )}
      </div>
      {localizeValue(view === 'tree' ? <BracketTree {...props} /> : <RoundList {...props} />)}
    </>
  );
}

/** Knockout rounds, latest first; long early rounds fold behind our tie. */
function RoundList({ w, rounds, fixtures, competition, year }: BracketProps) {
  useTextLocale();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!rounds.length) return null;
  return (
    <div className={c.bracket} aria-label={displayMessage('copy.Bracket.bd5683421c')}>
      {localizeValue(
        rounds
          .map((round, index) => ({ round, index }))
          .reverse()
          .map(({ round, index }) => {
            const decided = round.ties.filter((tie) => tie.winner).length;
            const long = round.ties.length > 8;
            const shown = long && !open[index];
            const ties = round.ties
              .map((tie, t) => ({ tie, t }))
              .filter(
                ({ tie }) => !shown || tie.home === w.playerClub || tie.away === w.playerClub,
              );
            const legs = legsOf(w, fixtures, competition, index, 0, year);
            return (
              <section key={index} className={c.round}>
                <header>
                  <h4>{localizeValue(round.label)}</h4>
                  <span>
                    {richMessage('copy.Bracket.60b31b536e', {
                      p0: roundDates(w, legs),
                      p1: decided,
                      p2: round.ties.length,
                      p3: round.byes?.length
                        ? sourceMessage('copy.Bracket.818ca6e428', { p0: round.byes.length })
                        : '',
                    })}
                  </span>
                </header>
                <ul className={c.ties}>
                  {localizeValue(
                    ties.map(({ tie, t }) => (
                      <Tie
                        key={t}
                        w={w}
                        tie={tie}
                        legs={legsOf(w, fixtures, competition, index, t, year)}
                      />
                    )),
                  )}
                </ul>
                {localizeValue(
                  long && (
                    <button
                      className={c.more}
                      onClick={() => setOpen({ ...open, [index]: !open[index] })}
                    >
                      {localizeValue(
                        shown
                          ? sourceMessage('copy.Bracket.060741d6f9', {
                              p0: round.label,
                              p1: round.ties.length,
                            })
                          : sourceMessage('copy.Bracket.aba0885359'),
                      )}
                    </button>
                  ),
                )}
              </section>
            );
          }),
      )}
    </div>
  );
}
