import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import type { TransferLedgerEntry } from '../../../../../../packages/engine/src/transfer-records';
import { Panel } from '../../../app/ui/App';
import { LEADER_PAGE } from '../../../entities/player/lib/careerRecords';
import { ClubLink } from '../../../entities/club';
import { seasonName } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { PlayerLink } from '../../../entities/player';
import { Segments } from '../../../shared/ui/Segments';
import { Select } from '../../../shared/ui/Select';
import { useTaskState } from '../../../shared/routing/taskMemory';
import {
  TRANSFER_BOARDS,
  transferRecordsView,
  transferSeasons,
  type TransferBoard,
  type TransferWorld,
} from '../lib/transferRecordsView';
import s from '../../../shared/ui/styles/App.module.css';

const BOARD_TITLE: Record<TransferBoard, string> = {
  in: sourceMessage('copy.TransferRecords.2502d33be0'),
  out: sourceMessage('copy.TransferRecords.c1b38e9b92'),
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
  useTextLocale();
  const [direction, setDirection] = useTaskState<TransferBoard>(w.id, 'transfer-board', 'in');
  const [season, setSeason] = useTaskState<string>(w.id, 'transfer-season', ALL);
  const seasons = transferSeasons(w, ledger),
    year = season === ALL || !seasons.includes(Number(season)) ? undefined : Number(season);
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label={displayMessage('copy.TransferRecords.c2f0b0501d')}
          options={TRANSFER_BOARDS}
          value={direction}
          onChange={setDirection}
        />
        <Select
          aria-label={displayMessage('copy.TransferRecords.c22f174075')}
          value={year === undefined ? ALL : String(year)}
          onValueChange={(value) => setSeason(value)}
        >
          <option value={ALL}>{richMessage('copy.TransferRecords.15d1e79b79')}</option>
          {localizeValue(
            seasons.map((y) => (
              <option key={y} value={String(y)}>
                {localizeValue(seasonName(y))}
              </option>
            )),
          )}
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
      <p className={s.muted}>{richMessage('copy.TransferRecords.f0afae6da6')}</p>
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
  useTextLocale();
  const [shown, setShown] = useState(LEADER_PAGE);
  const { rows, next } = transferRecordsView(w, ledger, { direction, year, shown }),
    code = w.clubs.find((c) => c.id === w.playerClub)!.country,
    title = BOARD_TITLE[direction];
  return (
    <Panel
      title={localizeValue(title)}
      note={sourceMessage('copy.TransferRecords.5ddc097395', {
        p0:
          year === undefined ? sourceMessage('copy.TransferRecords.15d1e79b79') : seasonName(year),
      })}
    >
      {localizeValue(
        rows.length ? (
          <div className={s.tableWrap}>
            <table className={s.leaderTable} aria-label={localizeValue(title)}>
              <thead>
                <tr>
                  <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                  <th scope="col">{richMessage('team.column.player')}</th>
                  <th scope="col">
                    {localizeValue(
                      direction === 'in'
                        ? sourceMessage('copy.TransferRecords.7017c0f5e0')
                        : sourceMessage('copy.TransferRecords.a7fd765a59'),
                    )}
                  </th>
                  <th scope="col">{richMessage('copy.ClubTrends.a3142392a3')}</th>
                  <th scope="col">{richMessage('copy.TransferRecords.e1b56dd677')}</th>
                  <th scope="col">{richMessage('copy.TransferRecords.d0c166b5f1')}</th>
                </tr>
              </thead>
              <tbody>
                {localizeValue(
                  rows.map((row) => (
                    <tr key={row.key}>
                      <td>{localizeValue(row.rank)}</td>
                      <td>
                        {localizeValue(
                          row.player ? <PlayerLink id={row.player} name={row.label} /> : row.label,
                        )}
                      </td>
                      <td>
                        {localizeValue(
                          row.club ? <ClubLink w={w} id={row.club} crest={14} /> : '—',
                        )}
                      </td>
                      <td>{localizeValue(seasonName(row.year))}</td>
                      <td>{localizeValue(row.kind ?? '—')}</td>
                      <td>
                        <Money value={row.today} code={code} year={w.year} />
                        {localizeValue(' ')}
                        <small className={s.muted}>
                          (<Money value={row.fee} code={code} year={row.year} />)
                        </small>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {localizeValue(
              next > shown && (
                <button
                  data-ui="link"
                  type="button"
                  className={s.textButton}
                  onClick={() => setShown(next)}
                >
                  {richMessage('copy.CareerRecordBook.c263a34471', { p0: shown + 1, p1: next })}
                </button>
              ),
            )}
          </div>
        ) : (
          <div className={s.empty}>{richMessage('copy.TransferRecords.10be4611fb')}</div>
        ),
      )}
    </Panel>
  );
}
