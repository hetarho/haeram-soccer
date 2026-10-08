import type { Player, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { careerRecords } from './careerRecords';
import { number, seasonName } from './format';
import s from './Analysis.module.css';

function SeasonContext({ record }: { record: SeasonArchive }) {
  return (
    <p className={s.note}>
      {seasonName(record.year)} · {record.tier + 1}부 · 그룹{' '}
      {String.fromCharCode(65 + record.group)} · 리그 {record.played}경기 · 감독 {record.manager}
    </p>
  );
}
function Leader({ player, index, label }: { player?: Player; index: number; label: string }) {
  return (
    <article>
      <h4>{label}</h4>
      {player ? (
        <>
          <b>
            {player.name} · {player.career[index]}회
          </b>
          <p className={s.note}>
            {player.role} ·{' '}
            {player.status === 'active'
              ? '활동 중'
              : player.status === 'retired'
                ? '은퇴 · 기록 보존'
                : '매각 · 기록 보존'}{' '}
            · {number(player.career[10])}분 출전
          </p>
        </>
      ) : (
        <p className={s.note}>첫 기록을 기다립니다.</p>
      )}
    </article>
  );
}
export function CareerRecordBook({ w }: { w: World }) {
  const records = careerRecords(w);
  return (
    <details className={s.disclosure}>
      <summary>우리 클럽 기록집</summary>
      <section className={s.content} aria-label="우리 클럽 기록집">
        <h3>완료한 {records.seasons}개 시즌의 발자취</h3>
        <p className={s.note}>
          시즌 기록은 리그 결산을 비교해요. 디비전·그룹·경기 수가 다른 기록은 그 맥락을 함께
          읽어주세요.
        </p>
        <div className={s.cards}>
          {records.finish && (
            <article>
              <h4>가장 높은 무대의 성적</h4>
              <b>
                {records.finish.tier + 1}부 {records.finish.rank}위
              </b>
              <SeasonContext record={records.finish} />
            </article>
          )}
          {records.points && (
            <article>
              <h4>최고 승점 페이스</h4>
              <b>{(records.points.points / records.points.played).toFixed(2)}점 / 경기</b>
              <p className={s.note}>
                {records.points.points}점 / {records.points.played}경기
              </p>
              <SeasonContext record={records.points} />
            </article>
          )}
          {records.attack && (
            <article>
              <h4>최고 득점 페이스</h4>
              <b>{(records.attack.gf / records.attack.played).toFixed(2)}골 / 경기</b>
              <p className={s.note}>
                {records.attack.gf}골 / {records.attack.played}경기
              </p>
              <SeasonContext record={records.attack} />
            </article>
          )}
          {records.supporters && (
            <article>
              <h4>시즌 결산 서포터 최다</h4>
              <b>{number(records.supporters.fans)}명</b>
              <SeasonContext record={records.supporters} />
            </article>
          )}
        </div>
        {!records.seasons && <p className={s.note}>완료한 시즌이 쌓이면 시즌 기록이 시작돼요.</p>}
        <h4>클럽 통산 선수 기록 · 모든 대회</h4>
        <div className={s.cards}>
          <Leader label="최다 득점" player={records.scorer} index={0} />
          <Leader label="최다 도움" player={records.creator} index={1} />
          <Leader label="골키퍼 최다 선방" player={records.keeper} index={9} />
        </div>
        <p className={s.note}>
          우리 클럽에서 기록한 기여만 집계해요. 동률은 가장 이른 시즌 또는 선수 ID 순으로
          표시합니다.
        </p>
      </section>
    </details>
  );
}
