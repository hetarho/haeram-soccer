import { Select } from './Select';
import { useState } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { encodeCsv, downloadCsv } from '../adapters/csv';
import { analysisDataset, type AnalysisDataset } from './analysisDataset';
import type { PlayerScope } from './playerAnalysis';
import { seasonName } from './format';
import s from './Analysis.module.css';
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
  const [type, setType] = useState<AnalysisDataset>('matches'),
    [playerScope, setPlayerScope] = useState<PlayerScope>('season'),
    [message, setMessage] = useState('');
  const dataset = analysisDataset(w, type, records, year, playerScope);
  const blocked = !dataset.rows.length || (type === 'matches' && !ready);
  const download = () => {
    if (blocked) return;
    try {
      downloadCsv(dataset.filename, encodeCsv(dataset.headers, dataset.rows));
      setMessage(`${dataset.rows.length}행의 분석 CSV를 다운로드했어요.`);
    } catch {
      setMessage('분석 파일을 만들지 못했어요. 다시 시도해보세요.');
    }
  };
  return (
    <details className={s.disclosure}>
      <summary>분석 데이터 내보내기</summary>
      <section className={s.content} aria-label="분석 데이터 내보내기">
        <div className={s.controls}>
          <label>
            다운로드할 표{' '}
            <Select
              aria-label="분석 데이터 종류"
              value={type}
              onValueChange={(value) => {
                setType(value as AnalysisDataset);
                setMessage('');
              }}
            >
              <option value="matches">선택한 시즌 경기</option>
              <option value="players">우리 선수 지표</option>
              <option value="seasons">완료 시즌 결산</option>
            </Select>
          </label>
          {type === 'players' && (
            <label>
              선수 표의 범위{' '}
              <Select
                aria-label="내보낼 선수 지표 범위"
                value={playerScope}
                onValueChange={(value) => {
                  setPlayerScope(value as PlayerScope);
                  setMessage('');
                }}
              >
                <option value="season">현재 시즌 · 모든 대회</option>
                <option value="career">우리 클럽 통산</option>
              </Select>
            </label>
          )}
        </div>
        <p className={s.note}>
          {type === 'matches'
            ? `${seasonName(year)} · ${scope}`
            : type === 'players'
              ? `현재 ${w.year}년 선수 자료 · ${playerScope === 'season' ? '이번 시즌 모든 대회' : '우리 클럽 통산 모든 대회'}`
              : `완료한 ${w.history.length}개 시즌 · 리그 성적과 결산`}{' '}
          · {dataset.rows.length}행
        </p>
        {type === 'players' && (
          <p className={s.note}>
            능력은 현재 또는 이탈 당시 보존한 값이에요. 과거 시즌의 선수 능력 스냅샷은 제공하지
            않아요.
          </p>
        )}
        {type === 'seasons' && (
          <p className={s.note}>장부 금액은 거래 당시 화폐의 최소 단위 정수로 기록해요.</p>
        )}
        <div className={s.controls}>
          <button disabled={blocked} onClick={download}>
            CSV 내려받기
          </button>
        </div>
        {blocked && (
          <p className={s.note}>
            {type === 'matches' && !ready
              ? '선택한 시즌 기록을 읽고 있어요.'
              : '이 범위에는 내보낼 기록이 없어요.'}
          </p>
        )}
        {message && (
          <p className={s.note} role="status">
            {message}
          </p>
        )}
        <p className={s.note}>
          스프레드시트에서 읽는 분석용 표예요. 게임 복원용 저장 파일은 메뉴에서 내보낼 수 있어요.
        </p>
      </section>
    </details>
  );
}
