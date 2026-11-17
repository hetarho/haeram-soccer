/**
 * T940 measurement baseline: FixtureReplicaWriter and fixtureRosterKey exactly as at the task base
 * (9bfd5e5acbe0e201ce75b34bd0befe698ace7ed7), frozen so the candidate in the tree can be timed against it in one process.
 */
import type { Club, Player } from '../../../../packages/contracts/src/types';
import { ATTRIBUTES } from '../../../../packages/contracts/src/player';
import {
  FIXTURE_PERSON_READ_KEYS,
  type FixtureReadCopy,
  type FixtureReadPerson,
} from '../../../../packages/engine/src/fixture-copy';

interface Changes<T> {
  put: [string, T][];
  drop: string[];
  order?: string[];
}
type Dynamic = Omit<FixtureReadCopy, 'clubs' | 'people' | 'squads'>;
interface Patch {
  state: Dynamic;
  clubs: Changes<Club>;
  people: Changes<FixtureReadPerson>;
  squads: Changes<Player[]>;
  /** Attribute columns alone for growth: no squad/profile retransmission or selection. */
  attributes: [string, [string, number[], number | null][]][];
  hasSquads: boolean;
  hasPeople: boolean;
  rosterChanged: boolean;
}
/** fixtureRosterKey at the task base. */
function fixtureRosterKey(copy: FixtureReadCopy): string {
  return JSON.stringify([
    copy.seed,
    copy.year,
    copy.squads,
    copy.clubs.map((c) => [c.id, c.country, c.strength, c.tier]),
    Object.values(copy.people ?? {}).map((p) =>
      p.playing === 'active'
        ? [...FIXTURE_PERSON_READ_KEYS.map((key) => p[key]), p.employment]
        : [p.id, p.playing],
    ),
    (copy.freeAgents ?? []).map((p) => p.id),
  ]);
}
const identity = (copy: Dynamic) =>
  JSON.stringify([copy.seed, copy.year, copy.playerClub, copy.matchModel]);
const textsOf = <T>(entries: [string, T][]) =>
  new Map(entries.map(([id, value]) => [id, JSON.stringify(value)]));
function changes<T>(
  entries: [string, T][],
  texts: Map<string, string>,
  old: Map<string, string>,
): Changes<T> {
  const order = [...texts.keys()];
  const before = [...old.keys()];
  return {
    put: entries.filter(([id]) => texts.get(id) !== old.get(id)),
    drop: before.filter((id) => !texts.has(id)),
    ...(order.length !== before.length || order.some((id, i) => id !== before[i]) ? { order } : {}),
  };
}

/** Immutable fingerprints only: never retains a live world or its mutable record objects. */
export class BaseFixtureReplicaWriter {
  private previous?: {
    revision: number;
    identity: string;
    roster: string;
    clubs: Map<string, string>;
    people: Map<string, string>;
    squads: Map<string, string>;
    profiles: Map<string, string>;
    attributes: Map<string, Map<string, string>>;
  };
  reset() {
    this.previous = undefined;
  }
  encode(copy: FixtureReadCopy, revision: number) {
    const clubs = copy.clubs.map((c): [string, Club] => [c.id, c]);
    const people = Object.entries(copy.people ?? {});
    const squads = Object.entries(copy.squads ?? {});
    const clubTexts = textsOf(clubs),
      peopleTexts = textsOf(people),
      squadTexts = textsOf(squads);
    if (clubTexts.size !== clubs.length) throw new Error('Duplicate fixture-copy club');
    const key = identity(copy),
      roster = fixtureRosterKey(copy);
    const previous = this.previous?.identity === key ? this.previous : undefined;
    const profiles = new Map<string, string>();
    const attributeTexts = new Map<string, Map<string, string>>();
    for (const [id, players] of squads) {
      if (previous && squadTexts.get(id) === previous.squads.get(id)) {
        profiles.set(id, previous.profiles.get(id)!);
        attributeTexts.set(id, previous.attributes.get(id)!);
        continue;
      }
      profiles.set(
        id,
        JSON.stringify(
          players.map(({ attrs, developed, ...profile }) => {
            void attrs;
            void developed;
            return profile;
          }),
        ),
      );
      attributeTexts.set(
        id,
        textsOf(
          players.map((p): [string, unknown] => [
            p.id,
            [ATTRIBUTES.map((a) => p.attrs[a]), p.developed ?? null],
          ]),
        ),
      );
    }
    let patch: string | undefined;
    if (previous) {
      const squadChanges = changes(squads, squadTexts, previous.squads);
      const columns = new Set(
        squadChanges.put
          .filter(([id]) => profiles.get(id) === previous.profiles.get(id))
          .map(([id]) => id),
      );
      squadChanges.put = squadChanges.put.filter(([id]) => !columns.has(id));
      const { clubs: _clubs, people: _people, squads: _squads, ...state } = copy;
      void _clubs;
      void _people;
      void _squads;
      patch = JSON.stringify({
        state,
        clubs: changes(clubs, clubTexts, previous.clubs),
        people: changes(people, peopleTexts, previous.people),
        hasPeople: copy.people !== undefined,
        squads: squadChanges,
        attributes: squads
          .filter(([id]) => columns.has(id))
          .map(([id, players]) => [
            id,
            players
              .filter(
                (p) => attributeTexts.get(id)!.get(p.id) !== previous.attributes.get(id)?.get(p.id),
              )
              .map((p) => [p.id, ATTRIBUTES.map((a) => p.attrs[a]), p.developed ?? null]),
          ]),
        hasSquads: copy.squads !== undefined,
        rosterChanged: previous.roster !== roster,
      } satisfies Patch);
    }
    this.previous = {
      revision,
      identity: key,
      roster,
      clubs: clubTexts,
      people: peopleTexts,
      squads: squadTexts,
      profiles,
      attributes: attributeTexts,
    };
    let snapshot: string | undefined;
    return {
      base: previous?.revision ?? 0,
      patch,
      snapshot: () => (snapshot ??= JSON.stringify(copy)),
    };
  }
}
