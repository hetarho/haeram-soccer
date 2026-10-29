import { PersonCareerLink } from './PersonCareer';
import type { GameClient } from '../runtime/client';
import { PlayingCoachReview } from './PlayingCoachReview';
import { useMemo, useState } from 'react';
import type { Player, World } from '../../../../packages/contracts/src/types';
import { agentOf, clausesLabel, talkFor } from '../../../../packages/engine/src/contracts';
import { yellowWarning } from '../../../../packages/engine/src/discipline';
import { seasonHeat, type HeatMap } from '../../../../packages/engine/src/material';
import { HeatPitch } from './HeatPitch';
import { useGameState } from '../runtime/store';
import { Attributes } from './Attributes';
import { clubRanks } from './careerRecords';
import { Dialog } from './Dialog';
import { number, percent, seasonName } from './format';
import { worldSelector } from './liveState';
import { PlayerAdvancedStats } from './PlayerAdvancedStats';
import { bansOf, banText } from './discipline';
import { Select } from './Select';
import {
  appearanceText,
  ofScope,
  playerStatus,
  type PlayerScope,
  type PlayerTally,
} from './playerAnalysis';
import { PlayerPerformance } from './PlayerPerformance';
import { PlayerProfile } from './PlayerProfile';
import { openCoachSheet, openContractTalk, usePlayerPreparation, usePlayerSheet } from './state';
import a from './Analysis.module.css';
import s from './App.module.css';

/**
 * A player's sheet: his club career first, whatever the roster shows (appearances, goals, assists,
 * saves for a keeper, where he is now and his places on the club's all-time boards), then his
 * production over this season or the club career. A player who left only has the club career.
 */
export function PlayerSheet({
  w,
  player,
  scope: initial,
  onClose,
  client,
  tally,
}: {
  w: World;
  player: Player;
  scope: PlayerScope;
  onClose: () => void;
  client: GameClient;
  /** His appearances, cards and season heat over every own match (the view's tallies). */
  tally?: PlayerTally;
}) {
  const active = player.status === 'active';
  const [chosen, setChosen] = useState<PlayerScope>(initial);
  const scope = active ? chosen : 'career';
  const career = player.career,
    stats = player[scope],
    ranks = clubRanks(w.players, player.id);
  return (
    <Dialog label={player.name} onClose={onClose}>
      {active && (
        <div className={s.playerActions} aria-label="이 선수 관리">
          <button
            type="button"
            onClick={() => {
              onClose();
              openCoachSheet('assistant', undefined, player.id);
            }}
          >
            이 선수 훈련 변경
          </button>
          {talkFor(w, player) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                openContractTalk(player.id);
              }}
            >
              계약 협상
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              usePlayerPreparation.getState().open(player.id);
            }}
          >
            다음 경기 선발·전술 준비
          </button>
        </div>
      )}
      <p>
        {player.position} · {active ? `${w.year - player.born}세` : `${player.born}년생`} · 에이전트{' '}
        {agentOf(w, player)}등급
      </p>
      {active && !player.loanUntil && <p>계약 조항: {clausesLabel(player.clauses)}</p>}
      <PlayerProfile w={w} player={player} own={active} />
      <PersonCareerLink id={player.id} name={player.name} client={client} />
      {active && <PlayingCoachReview w={w} player={player} client={client} />}
      <section data-surface="sheet" className={a.clubCareer} aria-label="우리 클럽 통산">
        <h3>우리 클럽 통산</h3>
        <p className={a.careerLine}>
          출전 {appearanceText(tally, 'career')} · {career[0]}골 · {career[1]}도움
          {player.position === 'GK' ? ` · ${career[9]}선방` : ''}
        </p>
        <div className={a.chips}>
          <span className={a.status} data-status={player.status}>
            {playerStatus(player)}
          </span>
          {ranks.map(({ board, rank, shared }) => (
            <span key={board.key}>
              클럽 역대 {board.short} {shared ? '공동 ' : ''}
              {rank}위
            </span>
          ))}
        </div>
        <p className={a.note}>
          모든 대회에서 우리 클럽 소속으로 남긴 기록이에요.
          {ranks.length ? '' : ' 클럽 역대 10위 안에 든 기록은 아직 없어요.'}
        </p>
      </section>
      {active && (
        <div data-ui="choices" className={s.segments} role="group" aria-label="선수 기록 범위">
          {(
            [
              ['season', '이번 시즌'],
              ['career', '클럽 통산'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={scope === id}
              className={scope === id ? s.selected : undefined}
              onClick={() => setChosen(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <PlayerPerformance player={player} scope={scope} />
      <Attributes
        rows={[
          ['출전', appearanceText(tally, scope)],
          ['득점', stats[0]],
          ['도움', stats[1]],
          ['누적 출전 분', stats[10]],
          ['패스 성공률', percent(stats[3], stats[2])],
          ['슈팅', stats[4]],
          ['유효 슈팅', stats[5]],
          ['태클', stats[6]],
          ['인터셉트', stats[7]],
          ['돌파', stats[8]],
          ['선방', stats[9]],
        ]}
      />
      <p>
        분모: 패스 시도 {number(stats[2])}회 ·{' '}
        {scope === 'career' ? '우리 클럽 통산' : '이번 시즌 모든 대회'}
      </p>
      <PlayerAdvancedStats w={w} player={player} scope={scope} />
      <Discipline w={w} player={player} tally={tally} />
      <SeasonHeat w={w} player={player} tally={tally} />
      <button onClick={onClose}>닫기</button>
    </Dialog>
  );
}

/** Cards this season and over the club career, and the bans still to serve (→WEB-59, HIST-16). */
function Discipline({ w, player, tally }: { w: World; player: Player; tally?: PlayerTally }) {
  const active = player.status === 'active';
  const cards = (scope: PlayerScope) =>
    `경고 ${ofScope(tally?.yellow, scope)} · 퇴장 ${ofScope(tally?.red, scope)}`;
  const bans = active ? bansOf(w, player.id) : [];
  return (
    <section
      data-surface="sheet"
      className={a.clubCareer}
      aria-label="징계"
      data-testid="player-discipline"
    >
      <h3>징계</h3>
      <p className={a.careerLine}>
        {active && `이번 시즌 ${cards('season')} · `}통산 {cards('career')}
      </p>
      {active && (
        <div className={a.chips}>
          {bans.length
            ? bans.map((ban, i) => <span key={i}>{banText(ban)}</span>)
            : '출장 정지 없음'}
          {yellowWarning(w, player) && <span>경고 누적 주의</span>}
        </div>
      )}
    </section>
  );
}
/** This season's heat map from its matches, earlier seasons' from the archive (→MATCH-5). */
function SeasonHeat({ w, player, tally }: { w: World; player: Player; tally?: PlayerTally }) {
  const seasons = useMemo(
    () => [
      ...(tally?.heat
        ? [
            {
              year: w.year,
              map: { cells: tally.heat, touches: tally.heat.reduce((a, b) => a + b, 0) },
            },
          ]
        : []),
      ...w.history
        .map((archive) => ({ year: archive.year, map: seasonHeat(archive, player.id) }))
        .filter((season): season is { year: number; map: HeatMap } => !!season.map)
        .reverse(),
    ],
    [tally?.heat, w.year, w.history, player.id],
  );
  const [year, setYear] = useState(seasons[0]?.year);
  const shown = seasons.find((season) => season.year === year) ?? seasons[0];
  return (
    <section
      data-surface="sheet"
      className={a.clubCareer}
      aria-label="시즌 히트맵"
      data-testid="player-heat"
    >
      <h3>시즌 히트맵</h3>
      {shown ? (
        <>
          {seasons.length > 1 && (
            <label>
              시즌{' '}
              <Select
                aria-label="히트맵 시즌"
                value={shown.year}
                onValueChange={(value) => setYear(Number(value))}
              >
                {seasons.map((season) => (
                  <option key={season.year} value={season.year}>
                    {seasonName(season.year)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {/* His attack frame, toward the goal on the right (→WEB-99). */}
          <HeatPitch map={shown.map} label={`터치 ${shown.map.touches}회 · 오른쪽으로 공격`} />
          <p className={a.note}>{seasonName(shown.year)} 우리 클럽 경기의 터치 위치예요.</p>
        </>
      ) : (
        <p className={a.note}>터치 위치가 기록된 경기가 아직 없어요.</p>
      )}
    </section>
  );
}

const selectPlayerWorld = worldSelector([
  'players',
  'settings',
  'calendar',
  'cash',
  'playingCoachProposals',
  'ownMatches',
  'year',
  'playerClub',
  'tactic',
  'lineup',
  'manager',
  'staff',
  'history',
  'discipline',
  'fixtures',
]);
/** The sheet of the player asked for, over the world in play (loaded when a sheet opens). */
export function OpenPlayerSheet({ id, client }: { id: string; client: GameClient }) {
  const w = useGameState(selectPlayerWorld);
  const scope = usePlayerSheet((state) => state.scope);
  const close = usePlayerSheet((state) => state.close);
  const tally = useGameState((state) => state.view?.tallies.players[id]);
  const player = w?.players.find((p) => p.id === id);
  if (!w || !player) return null;
  return (
    <PlayerSheet
      key={id}
      w={w}
      player={player}
      scope={scope}
      onClose={close}
      client={client}
      tally={tally}
    />
  );
}
