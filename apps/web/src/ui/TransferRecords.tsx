import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { TransferLedgerEntry } from '../../../../packages/engine/src/transfer-records';
import { Panel } from './App';
import { LEADER_PAGE } from './careerRecords';
import { ClubLink } from './ClubLink';
import { seasonName } from './format';
import { Money } from './Money';
import { PlayerLink } from './PlayerSheet';
import { Segments } from './Segments';
import { Select } from './Select';
import { useTaskState } from './taskMemory';
import {
  TRANSFER_BOARDS,
  transferRecordsView,
  transferSeasons,
  type TransferBoard,
  type TransferWorld,
} from './transferRecordsView';
import s from './App.module.css';

const BOARD_TITLE: Record<TransferBoard, string> = {
  in: '역대 최고 이적료 영입',
  out: '역대 최고 이적료 매각',
};
const ALL = 'all';
type BoardWorld = TransferWorld & Pick<World, 'id' | 'seed'>;

/**
 * 이적 기록 (→WEB-54, HIST-20): our fee signings or sales, over every season or one, ranked by the
 * fee in today's money with the amount as it was paid beside it.
 */
export function TransferRecords({
  w,
  ledger,
}: {
  w: BoardWorld;
  ledger: readonly TransferLedgerEntry[];
}) {
  const [direction, setDirection] = useTaskState<TransferBoard>(w.id, 'transfer-board', 'in');
  const [season, setSeason] = useTaskState<string>(w.id, 'transfer-season', ALL);
  const seasons = transferSeasons(w, ledger),
    year = season === ALL || !seasons.includes(Number(season)) ? undefined : Number(season);
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label="이적 기록 종류"
          options={TRANSFER_BOARDS}
          value={direction}
          onChange={setDirection}
        />
        <Select
          aria-label="이적 기록 시즌"
          value={year === undefined ? ALL : String(year)}
          onValueChange={(value) => setSeason(value)}
        >
          <option value={ALL}>전체 시즌</option>
          {seasons.map((y) => (
            <option key={y} value={String(y)}>
              {seasonName(y)}
            </option>
          ))}
        </Select>
      </div>
      {/* Another board or season starts again at ten (→WEB-54). */}
      <TransferTable
        key={`${direction}:${year ?? ALL}`}
        w={w}
        ledger={ledger}
        direction={direction}
        year={year}
      />
      <p className={s.muted}>
        이적료는 물가와 화폐 변화를 반영한 오늘 가치로 비교하고, 옆에 당시 금액을 적어요. 기록이
        시작되기 전의 거래는 장부에 남은 내용 그대로 보여줘요.
      </p>
    </>
  );
}

function TransferTable({
  w,
  ledger,
  direction,
  year,
}: {
  w: BoardWorld;
  ledger: readonly TransferLedgerEntry[];
  direction: TransferBoard;
  year?: number;
}) {
  const [shown, setShown] = useState(LEADER_PAGE);
  const { rows, next } = transferRecordsView(w, ledger, { direction, year, shown }),
    code = w.clubs.find((c) => c.id === w.playerClub)!.country,
    title = BOARD_TITLE[direction];
  return (
    <Panel
      title={title}
      note={`우리 클럽 · ${year === undefined ? '전체 시즌' : seasonName(year)}`}
    >
      {rows.length ? (
        <div className={s.tableWrap}>
          <table className={s.leaderTable} aria-label={title}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">선수</th>
                <th scope="col">{direction === 'in' ? '전 소속' : '이적한 클럽'}</th>
                <th scope="col">시즌</th>
                <th scope="col">형태</th>
                <th scope="col">이적료 (오늘 가치 · 당시)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.rank}</td>
                  <td>
                    {row.player ? <PlayerLink id={row.player} name={row.label} /> : row.label}
                  </td>
                  <td>{row.club ? <ClubLink w={w} id={row.club} crest={14} /> : '—'}</td>
                  <td>{seasonName(row.year)}</td>
                  <td>{row.kind ?? '—'}</td>
                  <td>
                    <Money value={row.today} code={code} year={w.year} />{' '}
                    <small className={s.muted}>
                      (<Money value={row.fee} code={code} year={row.year} />)
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {next > shown && (
            <button
              data-ui="link"
              type="button"
              className={s.textButton}
              onClick={() => setShown(next)}
            >
              더 보기 · {shown + 1}–{next}위
            </button>
          )}
        </div>
      ) : (
        <div className={s.empty}>기록된 이적료 거래가 없어요.</div>
      )}
    </Panel>
  );
}
