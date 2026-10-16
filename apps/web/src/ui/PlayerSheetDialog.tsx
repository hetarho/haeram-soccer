import type { GameClient } from '../runtime/client';
import { PlayingCoachReview } from './PlayingCoachReview';
import { useState } from 'react';
import type { Player, World } from '../../../../packages/contracts/src/types';
import { agentOf, clausesLabel, talkFor } from '../../../../packages/engine/src/contracts';
import { useGameState } from '../runtime/store';
import { Attributes } from './Attributes';
import { clubRanks } from './careerRecords';
import { Dialog } from './Dialog';
import { number, percent } from './format';
import { worldSelector } from './liveState';
import { PlayerAdvancedStats } from './PlayerAdvancedStats';
import { appearances, playerStatus, type PlayerScope } from './playerAnalysis';
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
}: {
  w: World;
  player: Player;
  scope: PlayerScope;
  onClose: () => void;
  client: GameClient;
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
      {active && <PlayingCoachReview w={w} player={player} client={client} />}
      <section className={a.clubCareer} aria-label="우리 클럽 통산">
        <h3>우리 클럽 통산</h3>
        <p className={a.careerLine}>
          출전 {appearances(career)}경기 · {career[0]}골 · {career[1]}도움
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
        <div className={s.segments} role="group" aria-label="선수 기록 범위">
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
          ['출전', `${appearances(stats)}경기`],
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
      <button onClick={onClose}>닫기</button>
    </Dialog>
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
]);
/** The sheet of the player asked for, over the world in play (loaded when a sheet opens). */
export function OpenPlayerSheet({ id, client }: { id: string; client: GameClient }) {
  const w = useGameState(selectPlayerWorld);
  const scope = usePlayerSheet((state) => state.scope);
  const close = usePlayerSheet((state) => state.close);
  const player = w?.players.find((p) => p.id === id);
  if (!w || !player) return null;
  return (
    <PlayerSheet key={id} w={w} player={player} scope={scope} onClose={close} client={client} />
  );
}
