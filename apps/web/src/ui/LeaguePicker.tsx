import { memo, useEffect, useState } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { selectLeagueWorld } from './liveState';
import { leagueParam, ownLeague, sameLeague, type LeagueChoice } from './league';
import { ClubCrest } from './ClubCrest';
import { Select } from './Select';
import { SeasonStepper } from './SeasonStepper';
import s from './App.module.css';

/** Every kept season, oldest first and the season in progress last (→WEB-40). */
function useLeagueSeasons() {
  const current = useGameState((state) => state.view?.world.year);
  const closed = useGameState((state) => state.view?.world.history.map((h) => h.year).join(','));
  if (current === undefined) return undefined;
  return {
    current,
    years: [
      ...(closed ? closed.split(',').map(Number) : []).filter((year) => year < current),
      current,
    ],
  };
}

/** A division option's value, its tier and regional group: `2.1` for 3부 B조. */
export const divisionValue = (league: Pick<LeagueChoice, 'tier' | 'group'>) =>
  `${league.tier}.${league.group}`;
export function parseDivision(value: string): Pick<LeagueChoice, 'tier' | 'group'> {
  const [tier, group] = value.split('.').map(Number);
  return { tier: tier || 0, group: group || 0 };
}

/** A league's name: country and division, its regional group when the division has several. */
export function leagueName(league: LeagueChoice, amateur = false) {
  const cp = country(league.code);
  if (amateur) return `${cp.name} 아마추어 리그`;
  const groups = cp.groups[league.tier]?.length ?? 1;
  return `${cp.name} ${league.tier + 1}부${groups > 1 ? ` ${String.fromCharCode(65 + league.group)}조` : ''}`;
}

/**
 * Another league's fixtures this season, read from the worker (the view carries only ours) and
 * again after every round; undefined for the own league or while the first read is on its way.
 */
export function useLeagueFixtures(client: GameClient, w: World, league?: LeagueChoice) {
  const other = league && !sameLeague(league, ownLeague(w)) ? league : undefined;
  const name = other && `${w.id}:${leagueParam(other)}:${w.year}`,
    key = name && `${name}:${w.round}`;
  const [read, setRead] = useState<{ name: string; key: string; fixtures: Fixture[] }>();
  useEffect(() => {
    if (!other || !name || !key) return;
    let valid = true;
    // The name and key spell out `other`, so they are all the effect needs to follow.
    client.leagueFixtures(other).then(
      (fixtures) => valid && setRead({ name, key, fixtures }),
      () => undefined,
    );
    return () => {
      valid = false;
    };
  }, [client, name, key]);
  // The same league keeps the previous round's read on screen until the new one lands.
  return name && read?.name === name ? read.fixtures : undefined;
}

/**
 * Which league the league views show (→WEB-40, WEB-65): any country, and any division with each of
 * its regional groups as an option of its own, the own league first; then, with `onSeason`, the
 * season stepper in the same row. The selects read short (`ENG`, `3부A`) and list full names.
 * Choosing the own league again clears the choice, so a promotion or relegation carries the views
 * along; while another league is shown, 우리 리그 in the row's free end clears it in one tap. A
 * closed season passes `own`, our league that season, so the league we play in now reads like any
 * other there.
 */
export const LeaguePicker = memo(function LeaguePicker({
  league,
  onLeague,
  own: base,
  season,
  onSeason,
}: {
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  own?: LeagueChoice;
  /** With `onSeason`, the season stepper joins country and division in the same row. */
  season?: number;
  onSeason?: (year: number) => void;
}) {
  const w = useGameState(selectLeagueWorld)!;
  const seasons = useLeagueSeasons();
  const own = base ?? ownLeague(w),
    // The amateur level sits one tier below the country's professional divisions.
    amateur = !country(own.code).groups[own.tier],
    shown = league ?? own,
    cp = country(shown.code);
  const choose = (next: LeagueChoice) => onLeague(sameLeague(next, own) ? undefined : next);
  return (
    <div className={`${s.filters} ${s.leaguePicker}`} role="group" aria-label="리그 선택">
      <label>
        <span className={s.srOnly}>국가</span>
        <Select
          aria-label="국가"
          title={cp.name}
          value={shown.code}
          hintLayout="inline"
          onValueChange={(code) => choose(code === own.code ? own : { code, tier: 0, group: 0 })}
        >
          {COUNTRIES.map((entry) => (
            <option
              key={entry.code}
              value={entry.code}
              data-short={entry.code}
              data-hint={entry.code}
            >
              {entry.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        <span className={s.srOnly}>디비전</span>
        <Select
          aria-label="디비전"
          value={divisionValue(shown)}
          onValueChange={(value) => choose({ code: shown.code, ...parseDivision(value) })}
        >
          {cp.groups.flatMap((groups, tier) =>
            groups.map((_, group) => {
              const letter = groups.length > 1 ? String.fromCharCode(65 + group) : '';
              return (
                <option
                  key={`${tier}.${group}`}
                  value={divisionValue({ tier, group })}
                  data-short={`${tier + 1}부${letter}`}
                >
                  {tier + 1}부{letter && ` ${letter}조`}
                </option>
              );
            }),
          )}
          {amateur && shown.code === own.code && (
            <option value={divisionValue(own)} data-short="아마">
              아마추어 리그
            </option>
          )}
        </Select>
      </label>
      {onSeason && seasons && (
        <SeasonStepper
          years={seasons.years}
          value={season ?? seasons.current}
          current={seasons.current}
          onChange={onSeason}
        />
      )}
      {league && !sameLeague(league, own) && (
        <button
          type="button"
          data-ui="link"
          className={s.ownLeague}
          aria-label="우리 리그 보기"
          onClick={() => onLeague(undefined)}
        >
          <ClubCrest w={w} id={w.playerClub} size={16} />
          <b>우리 리그</b>
        </button>
      )}
    </div>
  );
});
