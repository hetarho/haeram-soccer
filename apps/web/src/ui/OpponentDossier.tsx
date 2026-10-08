import type { World } from '../../../../packages/contracts/src/types';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { tacticLabel } from '../../../../packages/engine/src/world';
import { kindLabel, seasonName } from './format';
import { resultFor, scoutOpponent } from './scouting';
import s from './Analysis.module.css';

export function OpponentDossier({ w }: { w: World }) {
  const scout = scoutOpponent(w);
  if (!scout) return <p className={s.note}>다음 상대는 새 시즌 일정이 나오면 확인할 수 있어요.</p>;
  return (
    <details className={s.disclosure}>
      <summary>상대 스카우팅 노트</summary>
      <section className={s.content} aria-label="상대 스카우팅">
        <h3>스카우팅 · {scout.opponent.name}</h3>
        <p className={s.note}>
          {fixtureDate(w, scout.next)} · {kindLabel[scout.next.kind]} ·{' '}
          {scout.next.home === w.playerClub ? '홈' : '원정'}
        </p>
        <dl className={s.facts}>
          <div>
            <dt>상대 전력</dt>
            <dd>{scout.opponent.strength}/100</dd>
          </div>
          <div>
            <dt>상대 전술</dt>
            <dd>{tacticLabel[scout.tactic]}</dd>
          </div>
          <div>
            <dt>우리 리그 순위</dt>
            <dd>
              {scout.rank
                ? `${scout.rank}위 · ${scout.table?.points}점`
                : scout.sameLeague
                  ? '개막 전'
                  : '다른 리그'}
            </dd>
          </div>
        </dl>
        <h4>이번 시즌 리그 · 최근 {scout.form.length}경기</h4>
        <div className={s.chips}>
          {scout.form.map((f) => {
            const result = resultFor(f, scout.opponent.id)!;
            return (
              <span key={f.id}>
                {f.round}R · {result.result} {result.own}–{result.other}
              </span>
            );
          })}
        </div>
        {!scout.form.length && (
          <p className={s.note}>
            {scout.sameLeague
              ? '아직 완료한 리그 경기가 없어요.'
              : '다른 리그 상대의 최근 리그 폼은 제공하지 않아요.'}
          </p>
        )}
        <h4>최근 30경기 안의 맞대결 · {scout.meetings.length}경기</h4>
        <ul className={s.list}>
          {scout.meetings.map((f) => {
            const result = resultFor(f, w.playerClub)!;
            return (
              <li key={f.id}>
                {seasonName(f.year)} · {kindLabel[f.kind]} · 우리 {result.result} {result.own}–
                {result.other}
              </li>
            );
          })}
        </ul>
        {!scout.meetings.length && <p className={s.note}>이 범위에는 맞대결 기록이 없어요.</p>}
        <p className={s.note}>완료한 경기의 관찰입니다. 다음 경기 결과를 보장하지 않아요.</p>
      </section>
    </details>
  );
}
