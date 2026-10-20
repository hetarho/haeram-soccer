import { ATTRIBUTES, POSITIONS } from '../../contracts/src/player';
import type { Fixture, Tactic, World } from '../../contracts/src/types';
import { clubOf, createWorld, npcTactic, setLineup, simulateMatch, startingSquad } from './index';

interface Build {
  passing: number;
  defense: number;
  attack: number;
  stamina: number;
  fatigue?: number;
}

export function scenario(build: Build, opponentTactic: Tactic = 'balanced') {
  const w = createWorld({
    country: 'ENG',
    name: 'Build Laboratory',
    color: '#112233',
    seed: 'build-samples',
    level: 'normal' as const,
  });
  w.manager.ability = 50;
  // Every outfielder plays every outfield position alike, so each tactic's formation reads the
  // build's qualities whoever fills a slot: finishing, passing, defending and stamina.
  for (const player of w.players) {
    for (const a of ATTRIBUTES) player.attrs[a] = 55;
    if (player.position !== 'GK') {
      player.positions = Object.fromEntries(
        POSITIONS.filter((position) => position !== 'GK').map((position) => [position, 3]),
      );
      player.attrs.finishing = build.attack;
      player.attrs.passing = build.passing;
      player.attrs.tackling = player.attrs.positioning = build.defense;
    }
    player.attrs.stamina = build.stamina;
    player.fatigue = build.fatigue || 0;
  }
  // Every preset uses exactly this XI, so comparisons cannot select different players.
  setLineup(
    w,
    startingSquad(w, clubOf(w)).map((player) => player.id),
  );
  const opponent = w.clubs.find(
    (club) => club.id !== w.playerClub && npcTactic(club) === opponentTactic,
  )!;
  // Generated squads rate at their club strength; 55 fields an XI rated about like ours.
  opponent.strength = 55;
  const fixture: Fixture = {
    id: 'build-fixture',
    year: w.year,
    round: 1,
    kind: 'league',
    home: w.playerClub,
    away: opponent.id,
    country: 'ENG',
    groupKey: 'sample',
  };
  return { w, fixture };
}

export function sample(w: World, fixture: Fixture, tactic: Tactic, count = 160) {
  w.tactic = tactic;
  const totals = { margin: 0, shots: 0, concededShots: 0, possession: 0, passes: 0, attempts: 0 };
  for (let index = 0; index < count; index++) {
    const match = simulateMatch(w, { ...fixture, id: `sample:${index}` }).record;
    totals.margin += match.score.home - match.score.away;
    totals.shots += match.metrics[0][4];
    totals.concededShots += match.metrics[1][4];
    totals.possession += match.metrics[0][11];
    totals.passes += match.metrics[0][3];
    totals.attempts += match.metrics[0][2];
  }
  return totals;
}

export const baseline: Build = { passing: 55, defense: 55, attack: 55, stamina: 55 };
