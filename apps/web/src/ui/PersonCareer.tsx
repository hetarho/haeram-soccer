import { useEffect, useState } from 'react';
import type { CareerDate } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { PersonCareerDetail } from '../runtime/personCareer';
import { STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { Dialog } from './Dialog';
import { ClubLink } from './ClubLink';
import { useGameState } from '../runtime/store';
const date = (at: CareerDate) =>
  new Date(Date.UTC(at.year, 7, 1) + at.day * 86400000).toISOString().slice(0, 10);
export function PersonCareerLink({
  id,
  name,
  client,
}: {
  id: string;
  name: string;
  client: GameClient;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`${name} 인물 경력`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        인물 경력
      </button>
      {open && <PersonCareer id={id} client={client} onClose={() => setOpen(false)} />}
    </>
  );
}
export function PersonCareer({
  id,
  client,
  onClose,
}: {
  id: string;
  client: GameClient;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PersonCareerDetail>(),
    [error, setError] = useState<string>();
  const w = useGameState((state) => state.view?.world);
  useEffect(() => {
    let current = true;
    setDetail(undefined);
    setError(undefined);
    void client.personCareer(id).then(
      (value) => {
        if (current) setDetail(value);
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [id, client]);
  const d = detail?.person.id === id ? detail : undefined;
  return (
    <Dialog label="인물 경력" onClose={onClose}>
      {error ? (
        <p role="status">경력 상세를 불러올 수 없어요. {error}</p>
      ) : !d ? (
        <p role="status">경력을 불러오는 중이에요.</p>
      ) : (
        <>
          <h2>{d.person.name} · 인물 경력</h2>
          <p>
            {d.person.born}년생 · {d.at.year - d.person.born}세
          </p>
          <h3>선수 경력</h3>
          {d.ownPlayingTotals ? (
            <p>
              우리 클럽에서 기록한 통산 경기 {d.ownPlayingTotals[0]} · 득점 {d.ownPlayingTotals[1]}{' '}
              · 도움 {d.ownPlayingTotals[2]}
            </p>
          ) : (
            <p>기록되지 않은 다른 구단·시작 이전 선수 통계는 제공되지 않아요.</p>
          )}
          <p>
            실제 코치 재직 {d.service.days}일{d.service.qualified ? ' · 3년 근무 충족' : ''}
          </p>
          {d.overlap && (
            <p>
              선수와 코치 재직이 겹친 플레잉 코치 기간을 포함해요. 코치 근무일은 중복 계산하지
              않아요.
            </p>
          )}
          {d.person.coaching && (
            <p>
              코치 능력 {d.person.coaching.ability} / 잠재력 {d.person.coaching.potential}
            </p>
          )}
          {d.person.management && (
            <p>
              감독 능력 {d.person.management.ability} / 잠재력 {d.person.management.potential} ·{' '}
              {STYLE_INFO[d.person.management.school].label}
            </p>
          )}
          <h3>실제 재직 기록</h3>
          <ol>
            {d.person.employment.map((job, index) => (
              <li key={index}>
                {job.role === 'player'
                  ? '선수'
                  : job.role === 'manager'
                    ? '감독'
                    : STAFF_INFO[job.role].label}{' '}
                · {w ? <ClubLink w={w} id={job.club} /> : job.club} · {date(job.from)}–
                {job.to ? date(job.to) : '재직 중'}
              </li>
            ))}
          </ol>
          <h3>함께 근무한 감독</h3>
          {d.person.mentors.length ? (
            <ul>
              {d.person.mentors.map((mentor, index) => (
                <li key={index}>
                  {mentor.name} ·{' '}
                  {mentor.school ? STYLE_INFO[mentor.school].label : '학파 기록 없음'} ·{' '}
                  {date(mentor.from)}–{mentor.to ? date(mentor.to) : '현재'}
                </li>
              ))}
            </ul>
          ) : (
            <p>기록된 멘토가 없어요. 시작 이전 관계는 추정하지 않아요.</p>
          )}
        </>
      )}
      <button onClick={onClose}>닫기</button>
    </Dialog>
  );
}
