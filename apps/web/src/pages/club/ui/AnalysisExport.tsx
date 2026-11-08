import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { Select } from '../../../shared/ui/Select';
import { useState } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import { ownSeasons } from '../../../../../../packages/engine/src/player-state';
import { encodeCsv, downloadCsv } from '../../../adapters/csv';
import { analysisDataset, type AnalysisDataset } from '../lib/analysisDataset';
import type { PlayerScope } from '../../../entities/player/lib/playerAnalysis';
import { seasonName } from '../../../presentation/format';
import s from '../../../shared/ui/styles/Analysis.module.css';
export function AnalysisExport({
  w,
  records,
  year,
  scope,
  ready,
}: {
  w: World;
  records: MatchRecord[];
  year: number;
  scope: string;
  ready: boolean;
}) {
  useTextLocale();
  const [type, setType] = useState<AnalysisDataset>('matches'),
    [playerScope, setPlayerScope] = useState<PlayerScope>('season'),
    [message, setMessage] = useState('');
  const dataset = analysisDataset(w, type, records, year, playerScope);
  const blocked = !dataset.rows.length || (type === 'matches' && !ready);
  const download = () => {
    if (blocked) return;
    try {
      downloadCsv(dataset.filename, encodeCsv(dataset.headers, dataset.rows));
      setMessage(sourceMessage('copy.AnalysisExport.09f98d084e', { p0: dataset.rows.length }));
    } catch {
      setMessage(sourceMessage('copy.AnalysisExport.6474987234'));
    }
  };
  return (
    <details data-ui="disclosure" className={s.disclosure}>
      <summary>{richMessage('copy.AnalysisExport.7e777e0392')}</summary>
      <section className={s.content} aria-label={displayMessage('copy.AnalysisExport.7e777e0392')}>
        <div className={s.controls}>
          <label>
            {richMessage('copy.AnalysisExport.259e31cc8e', {
              p0: ' ',
              p1: (
                <Select
                  aria-label={displayMessage('copy.AnalysisExport.c41fdaf018')}
                  value={type}
                  onValueChange={(value) => {
                    setType(value as AnalysisDataset);
                    setMessage('');
                  }}
                >
                  <option value="matches">{richMessage('copy.AnalysisExport.ee5174a046')}</option>
                  <option value="players">{richMessage('copy.AnalysisExport.d79746764b')}</option>
                  <option value="seasons">{richMessage('copy.AnalysisExport.b1af0a170c')}</option>
                </Select>
              ),
            })}
          </label>
          {localizeValue(
            type === 'players' && (
              <label>
                {richMessage('copy.AnalysisExport.3fbd9cb1d7', {
                  p0: ' ',
                  p1: (
                    <Select
                      aria-label={displayMessage('copy.AnalysisExport.c6a5267a97')}
                      value={playerScope}
                      onValueChange={(value) => {
                        setPlayerScope(value as PlayerScope);
                        setMessage('');
                      }}
                    >
                      <option value="season">
                        {richMessage('copy.AnalysisExport.92da79e9ab')}
                      </option>
                      <option value="career">
                        {richMessage('copy.AnalysisExport.05b05e1b81')}
                      </option>
                    </Select>
                  ),
                })}
              </label>
            ),
          )}
        </div>
        <p className={s.note}>
          {richMessage('copy.AnalysisExport.f819f650f4', {
            p0:
              type === 'matches'
                ? `${seasonName(year)} · ${scope}`
                : type === 'players'
                  ? sourceMessage('copy.AnalysisExport.9e344efbf2', {
                      p0: w.year,
                      p1:
                        playerScope === 'season'
                          ? sourceMessage('copy.AnalysisExport.2686dd9f2b')
                          : sourceMessage('copy.AnalysisExport.fd91cd4a41'),
                    })
                  : sourceMessage('copy.AnalysisExport.8d4b4df7d7', { p0: ownSeasons(w).length }),
            p1: ' ',
            p2: dataset.rows.length,
          })}
        </p>
        {localizeValue(
          type === 'players' && (
            <p className={s.note}>{richMessage('copy.AnalysisExport.b8dd5e6a34')}</p>
          ),
        )}
        {localizeValue(
          type === 'seasons' && (
            <p className={s.note}>{richMessage('copy.AnalysisExport.6454f9e7e0')}</p>
          ),
        )}
        <div className={s.controls}>
          <button disabled={blocked} onClick={download}>
            {richMessage('copy.AnalysisExport.a1abc03680')}
          </button>
        </div>
        {localizeValue(
          blocked && (
            <p className={s.note}>
              {localizeValue(
                type === 'matches' && !ready
                  ? sourceMessage('copy.AnalysisExport.16498b1529')
                  : sourceMessage('copy.AnalysisExport.4841256913'),
              )}
            </p>
          ),
        )}
        {localizeValue(
          message && (
            <p className={s.note} role="status">
              {localizeValue(message)}
            </p>
          ),
        )}
        <p className={s.note}>{richMessage('copy.AnalysisExport.ece8cda49c')}</p>
      </section>
    </details>
  );
}
