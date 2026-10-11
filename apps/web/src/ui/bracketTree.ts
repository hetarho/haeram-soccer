import type {
  BracketArchive,
  Fixture,
  KnockoutRound,
  KnockoutTie,
  World,
} from '../../../../packages/contracts/src/types';
import { cupKey } from '../../../../packages/engine/src/cups';
import { roundLabel, tieId } from '../../../../packages/engine/src/knockout';
import { clubOf } from '../../../../packages/engine/src/world';

/** A slot of the tree: a drawn tie, a club through on a bye, or a tie still to be drawn. */
export type Slot = { tie: number } | { bye: string } | undefined;
export interface TreeColumn {
  label: string;
  /** The drawn round in `rounds`; rounds still to come have none. */
  index?: number;
  slots: Slot[];
}

/** Clubs the tree starts from at most: the last 32, as the season archive keeps them (→WEB-40). */
const TREE_FIELD = 32;

/** Clubs a round starts with: both sides of every tie and the seeds waiting on a bye. */
export const roundField = (round: KnockoutRound) =>
  2 * round.ties.length + (round.byes?.length ?? 0);

/**
 * The round the tree starts at: qualifiers aside, the first that starts with 32 clubs or fewer,
 * byes counted (a German cup's 8-tie first round still has 72 clubs); −1 while none is drawn.
 */
export function treeStart(rounds: readonly KnockoutRound[]) {
  return rounds.findIndex(
    (round) => !round.label.startsWith('예선') && roundField(round) <= TREE_FIELD,
  );
}

/**
 * The knockout as a tree (→WEB-40): from the first round of 32 clubs or fewer to the final. Draws
 * are open each round, so the tree is traced back from the latest drawn round: each tie's two
 * clubs came out of one tie each in the round before (or a bye). That round lists its ties, then
 * the clubs waiting on a bye; the rounds still to come pair its winners and byes until the final.
 */
export function treeColumns(rounds: readonly KnockoutRound[]): TreeColumn[] | undefined {
  const base = treeStart(rounds);
  if (base < 0) return undefined;
  const last = rounds.length - 1,
    latest = rounds[last];
  const columns: TreeColumn[] = [
    {
      label: latest.label,
      index: last,
      slots: [
        ...latest.ties.map((_, tie) => ({ tie })),
        ...(latest.byes || []).map((bye) => ({ bye })),
      ],
    },
  ];
  for (let r = last - 1; r >= base; r--) {
    const where = new Map<string, number>();
    rounds[r].ties.forEach((tie, t) => {
      where.set(tie.home, t);
      where.set(tie.away, t);
    });
    const slots: Slot[] = [];
    for (const slot of columns[0].slots) {
      if (!slot || !('tie' in slot)) {
        slots.push(undefined, undefined);
        continue;
      }
      const tie = rounds[r + 1].ties[slot.tie];
      for (const club of [tie.home, tie.away]) {
        const from = where.get(club);
        slots.push(from === undefined ? { bye: club } : { tie: from });
      }
    }
    columns.unshift({ label: rounds[r].label, index: r, slots });
  }
  let index = rounds.length;
  for (
    let clubs = latest.ties.length + (latest.byes?.length ?? 0);
    clubs > 1;
    clubs = Math.ceil(clubs / 2)
  )
    columns.push({
      label: roundLabel(clubs, index++),
      slots: Array.from({ length: Math.ceil(clubs / 2) }, () => undefined),
    });
  return columns;
}

/**
 * A closed season's bracket as the live knockout the bracket views draw (→HIST-13): its rounds,
 * ties with their winners, and a fixture per leg. IDs follow the live ones by archived round
 * (second legs `:2`, a round later) so legsOf and fixtureDate find them with the season's year.
 */
export function archivedKnockout(w: World, year: number, bracket: BracketArchive) {
  const domestic = bracket.key === 'cup',
    code = clubOf(w).country,
    competition = domestic ? cupKey(code) : bracket.key,
    kind: Fixture['kind'] = domestic ? 'cup' : 'europe',
    country = domestic ? code : 'UEFA';
  const club = (index: number) => w.clubs[index]?.id ?? '';
  const fixtures: Fixture[] = [];
  const rounds = bracket.rounds.map((round, i): KnockoutRound => {
    const ties = round.ties.map(([home, away, home1, away1, home2, away2, outcome], t) => {
      // Outcome: the winner's side, + 2 on penalties, + 4 on away goals (BracketArchive).
      const tie: KnockoutTie = {
        home: club(home),
        away: club(away),
        winner: club(outcome & 1 ? away : home),
        ...(outcome & 2
          ? { decided: 'pens' as const }
          : outcome & 4
            ? { decided: 'away' as const }
            : {}),
      };
      const first: Fixture = {
        id: tieId(w, competition, i, t, year),
        year,
        round: round.round,
        kind,
        home: tie.home,
        away: tie.away,
        country,
        groupKey: competition,
        score: { home: home1, away: away1 },
      };
      fixtures.push(first);
      if (round.legs === 2)
        fixtures.push({
          ...first,
          id: `${first.id}:2`,
          round: round.round + 1,
          home: tie.away,
          away: tie.home,
          score: { home: home2, away: away2 },
        });
      return tie;
    });
    return {
      label: round.label,
      round: round.round,
      legs: round.legs,
      ties,
      ...(round.byes?.length ? { byes: round.byes.map(club) } : {}),
    };
  });
  return { competition, rounds, fixtures };
}
