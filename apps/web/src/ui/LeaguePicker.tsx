import { memo, useEffect, useState } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { COUNTRIES, country } from '../../../../packages/catalogs/src/index';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { selectLeagueWorld } from './liveState';
import { leagueParam, ownLeague, sameLeague, type LeagueChoice } from './league';
import { Select } from './Select';
import s from './App.module.css';

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
 * Which league the league views show: any country, division and regional group of the pyramid,
 * the own league first (→WEB-65). Choosing the own league again clears the choice, so a promotion
 * or relegation carries the views along. A closed season passes `own`, our league that season, so
 * the league we play in now reads like any other there.
 */
export const LeaguePicker = memo(function LeaguePicker({
  league,
  onLeague,
  own: base,
}: {
  league?: LeagueChoice;
  onLeague: (league?: LeagueChoice) => void;
  own?: LeagueChoice;
}) {
  const w = useGameState(selectLeagueWorld)!;
  const own = base ?? ownLeague(w),
    // The amateur level sits one tier below the country's professional divisions.
    amateur = !country(own.code).groups[own.tier],
    shown = league ?? own,
    cp = country(shown.code);
  const choose = (next: LeagueChoice) => onLeague(sameLeague(next, own) ? undefined : next);
  return (
    <div className={`${s.filters} ${s.leaguePicker}`} role="group" aria-label="리그 선택">
      <label>
        국가{' '}
        <Select
          aria-label="국가"
          value={shown.code}
          onValueChange={(code) => choose(code === own.code ? own : { code, tier: 0, group: 0 })}
        >
          {COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        디비전{' '}
        <Select
          aria-label="디비전"
          value={shown.tier}
          onValueChange={(value) =>
            choose(
              Number(value) === own.tier && shown.code === own.code
                ? own
                : { code: shown.code, tier: Number(value), group: 0 },
            )
          }
        >
          {cp.groups.map((_, i) => (
            <option key={i} value={i}>
              {i + 1}부
            </option>
          ))}
          {amateur && shown.code === own.code && (
            <option value={own.tier}>아마추어 리그 · 프로 진입 도전</option>
          )}
        </Select>
      </label>
      {cp.groups[shown.tier]?.length > 1 && (
        <label>
          지역 그룹{' '}
          <Select
            aria-label="지역 그룹"
            value={shown.group}
            onValueChange={(value) => choose({ ...shown, group: Number(value) })}
          >
            {cp.groups[shown.tier].map((_, i) => (
              <option key={i} value={i}>
                {String.fromCharCode(65 + i)}
              </option>
            ))}
          </Select>
        </label>
      )}
      {league && !sameLeague(league, own) && (
        <button type="button" className={s.leagueHome} onClick={() => onLeague(undefined)}>
          우리 리그로
        </button>
      )}
    </div>
  );
});
