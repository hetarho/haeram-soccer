import { Select } from './Select';
import { useEffect, useState } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { fixtureDate, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { ownSeasonFixtures } from './fixtures';
import { resultFor } from './scouting';
import { kindLabel } from './format';
import { Dialog } from './Dialog';
import { MatchReport } from './MatchReport';
import s from './Analysis.module.css';

export function FixtureNotebook({ w, client }: { w: World; client: GameClient }) {
  const [scope, setScope] = useState('upcoming'),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState('all'),
    [venue, setVenue] = useState('all'),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ id: string; year: number }>();
  const [loaded, setLoaded] = useState<{ id: string; record?: MatchRecord; error?: string }>();
  useEffect(() => {
    setPage(0);
  }, [w.year]);
  useEffect(() => {
    if (!selected) return;
    let valid = true;
    void client
      .archive(selected.year)
      .then((data) => {
        if (!valid) return;
        const record = data?.matches.find((m) => m.id === selected.id);
        setLoaded({
          id: selected.id,
          record,
          error: record ? undefined : '경기 기록을 읽지 못했어요. 창을 닫고 다시 열어보세요.',
        });
      })
      .catch(() => {
        if (valid)
          setLoaded({ id: selected.id, error: '경기 기록을 읽지 못했어요. 다시 열어보세요.' });
      });
    return () => {
      valid = false;
    };
  }, [client, selected]);
  const fixtures = ownSeasonFixtures(w).filter(
    (f) =>
      (scope === 'all' || (scope === 'completed' ? !!f.score : !f.score)) &&
      (kind === 'all' || f.kind === kind) &&
      (venue === 'all' || (venue === 'home' ? f.home === w.playerClub : f.away === w.playerClub)),
  );
  const last = Math.max(0, Math.ceil(fixtures.length / 20) - 1),
    current = Math.min(page, last),
    next = nextOwnFixture(w);
  const detail = loaded?.id === selected?.id ? loaded : undefined;
  return (
    <>
      <details className={s.disclosure} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>우리 팀 일정 노트</summary>
        {open && (
          <section className={s.content} aria-label="우리 팀 일정 노트">
            <div className={s.controls}>
              <label>
                진행 상태{' '}
                <Select
                  aria-label="일정 진행 상태"
                  value={scope}
                  onValueChange={(value) => {
                    setScope(value);
                    setPage(0);
                  }}
                >
                  <option value="upcoming">예정 경기</option>
                  <option value="completed">완료 경기</option>
                  <option value="all">전체 일정</option>
                </Select>
              </label>
              <label>
                대회{' '}
                <Select
                  aria-label="일정 대회"
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value);
                    setPage(0);
                  }}
                >
                  <option value="all">모든 대회</option>
                  {Object.entries(kindLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                장소{' '}
                <Select
                  aria-label="일정 홈 원정"
                  value={venue}
                  onValueChange={(value) => {
                    setVenue(value);
                    setPage(0);
                  }}
                >
                  <option value="all">홈·원정</option>
                  <option value="home">홈</option>
                  <option value="away">원정</option>
                </Select>
              </label>
            </div>
            <p className={s.note}>
              이번 시즌 확정 일정 · {fixtures.length}경기 · 국내 컵과 플레이오프는 시즌 마감 때
              일정이 추가될 수 있어요.
            </p>
            <div className={s.cards}>
              {fixtures.slice(current * 20, (current + 1) * 20).map((f) => {
                const ownHome = f.home === w.playerClub,
                  opponent = w.clubs.find((c) => c.id === (ownHome ? f.away : f.home)),
                  result = resultFor(f, w.playerClub);
                return (
                  <article key={f.id} data-testid="fixture-card">
                    <p className={s.note}>
                      {fixtureDate(w, f)} · {kindLabel[f.kind]} · {ownHome ? '홈' : '원정'}
                      {f.id === next?.id && ' · 다음 경기'}
                    </p>
                    <h4>{opponent?.name || '상대 미정'}</h4>
                    {result ? (
                      <>
                        <b>
                          우리 {result.result} {result.own}–{result.other}
                        </b>
                        <p className={s.note}>정규 90분 결과</p>
                        <button
                          onClick={() => {
                            setLoaded(undefined);
                            setSelected({ id: f.id, year: f.year });
                          }}
                        >
                          이 경기 분석 보기
                        </button>
                      </>
                    ) : (
                      <b>킥오프를 기다립니다</b>
                    )}
                  </article>
                );
              })}
            </div>
            {!fixtures.length && <p className={s.note}>이 조건에 맞는 확정 경기가 없어요.</p>}
            {last > 0 && (
              <div className={s.controls}>
                <button disabled={current === 0} onClick={() => setPage(current - 1)}>
                  이전 일정
                </button>
                <span className={s.note}>
                  {current + 1}/{last + 1}
                </span>
                <button disabled={current === last} onClick={() => setPage(current + 1)}>
                  다음 일정
                </button>
              </div>
            )}
          </section>
        )}
      </details>
      {selected && (
        <Dialog label="일정 경기 분석" onClose={() => setSelected(undefined)} wide>
          {detail?.record ? (
            <MatchReport record={detail.record} w={w} />
          ) : (
            <p className={s.note} role={detail?.error ? 'alert' : 'status'}>
              {detail?.error || '경기 기록을 펼치는 중…'}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
