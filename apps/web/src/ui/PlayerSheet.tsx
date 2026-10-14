import { useEffect, useState } from 'react';
import type { Player, World } from '../../../../packages/contracts/src/types';
import { agentOf, clausesLabel } from '../../../../packages/engine/src/contracts';
import { useGameState } from '../runtime/store';
import { Attributes } from './Attributes';
import { clubRanks } from './careerRecords';
import { Dialog } from './Dialog';
import { number, percent } from './format';
import { worldSelector } from './liveState';
import { PlayerAdvancedStats } from './PlayerAdvancedStats';
import { appearances, playerStatus, type PlayerScope } from './playerAnalysis';
import { PlayerPerformance } from './PlayerPerformance';
import { useNavigation, usePlayerSheet } from './state';
import link from './ClubLink.module.css';
import a from './Analysis.module.css';
import s from './App.module.css';

/**
 * One of our players named anywhere: pressing the name opens his player sheet. It looks like a
 * club name (→WEB-58), text with a dotted underline, and its accessible name says what it opens.
 */
export function PlayerLink({
  id,
  name,
  scope,
  className,
}: {
  id: string;
  name: string;
  /** The record the sheet opens on; the club career unless given. */
  scope?: PlayerScope;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${link.link} ${className ?? ''}`}
      aria-label={`${name} 선수 기록`}
      onClick={(event) => {
        event.currentTarget.focus();
        usePlayerSheet.getState().open(id, scope);
      }}
    >
      <span>{name}</span>
    </button>
  );
}

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
}: {
  w: World;
  player: Player;
  scope: PlayerScope;
  onClose: () => void;
}) {
  const active = player.status === 'active';
  const [chosen, setChosen] = useState<PlayerScope>(initial);
  const scope = active ? chosen : 'career';
  const career = player.career,
    stats = player[scope],
    ranks = clubRanks(w.players, player.id);
  return (
    <Dialog label={player.name} onClose={onClose}>
      <p>
        {player.position} · {active ? `${w.year - player.born}세` : `${player.born}년생`} · 에이전트{' '}
        {agentOf(w, player)}등급
      </p>
      {active && !player.loanUntil && <p>계약 조항: {clausesLabel(player.clauses)}</p>}
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

const selectPlayerWorld = worldSelector(['players', 'ownMatches', 'year', 'playerClub']);
function OpenPlayerSheet({ id }: { id: string }) {
  const w = useGameState(selectPlayerWorld);
  const scope = usePlayerSheet((state) => state.scope);
  const close = usePlayerSheet((state) => state.close);
  const player = w?.players.find((p) => p.id === id);
  if (!w || !player) return null;
  return <PlayerSheet key={id} w={w} player={player} scope={scope} onClose={close} />;
}
/** The one place player sheets open, over any view or dialog. */
export function PlayerSheetHost() {
  const id = usePlayerSheet((state) => state.id);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // A sheet belongs to the view and the world it was opened from.
  useEffect(() => () => usePlayerSheet.getState().close(), [page, worldId]);
  return id ? <OpenPlayerSheet id={id} /> : null;
}
