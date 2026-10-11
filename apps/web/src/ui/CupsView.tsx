import { useState } from 'react';
import type {
  CupFinal,
  EuropeTournament,
  Fixture,
  KnockoutRound,
  TableRow,
  World,
} from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { clubOf } from '../../../../packages/engine/src/world';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { cupKey, domesticCupName } from '../../../../packages/engine/src/cups';
import {
  legsOf,
  ownReached,
  roundLabel,
  tieAggregate,
} from '../../../../packages/engine/src/knockout';
import { phaseGroups } from '../../../../packages/engine/src/europe';
import { emptyTable } from '../../../../packages/engine/src/season';
import { ClubCrest } from './ClubCrest';
import { number, seasonName } from './format';
import s from './App.module.css';
import c from './CupsView.module.css';

const nameOf = (w: World, id?: string) => w.clubs.find((club) => club.id === id)?.name ?? '—';

/** Clubs ranked by a competition table: points, goal difference, goals, then ID. */
function rankIds(standings: Record<string, TableRow>, ids: string[]) {
  return [...ids].sort((a, b) => {
    const x = standings[a] || emptyTable(),
      y = standings[b] || emptyTable();
    return (
      y.points - x.points ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      (a < b ? -1 : a > b ? 1 : 0)
    );
  });
}

function Club({ w, id, strong }: { w: World; id: string; strong?: boolean }) {
  return (
    <span className={`${c.club} ${strong ? c.strong : ''} ${id === w.playerClub ? c.ownName : ''}`}>
      <ClubCrest w={w} id={id} size={16} />
      <span>{nameOf(w, id)}</span>
    </span>
  );
}

/** One tie: both legs' scores, the aggregate and how a level tie went through. */
function Tie({ w, tie, legs }: { w: World; tie: KnockoutRound['ties'][number]; legs: Fixture[] }) {
  const own = tie.home === w.playerClub || tie.away === w.playerClub;
  const played = legs.filter((f) => f.score);
  const [home, away] = tieAggregate(tie, legs);
  const score = played.length
    ? legs.length === 2
      ? `${played.map((f) => `${f.score!.home}–${f.score!.away}`).join(', ')}${played.length === 2 ? ` · 합계 ${home}–${away}` : ''}`
      : `${home}–${away}`
    : fixtureDate(w, legs[0]).replace(/^\d+년 /, '');
  return (
    <li className={own ? c.ownTie : undefined}>
      <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
      <em>
        {score}
        {tie.decided === 'pens' && <small> 승부차기</small>}
        {tie.decided === 'away' && <small> 원정 다득점</small>}
      </em>
      <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
      {own && <i className={c.ownBadge}>우리 팀</i>}
    </li>
  );
}

/** A slot of the tree: a drawn tie, a club through on a bye, or a tie still to be drawn. */
type Slot = { tie: number } | { bye: string } | undefined;
/** Rounds of 32 or fewer go on the tree; earlier rounds stay in the list. */
const TREE_TIES = 16;
/**
 * The knockout as a tree (→WEB-40): from the first round of 32 or fewer to the final. Draws are
 * open each round, so the tree is traced back from the latest drawn round: each tie's two clubs
 * came out of one tie each in the round before (or a bye); rounds not drawn yet are empty slots.
 */
function treeColumns(rounds: KnockoutRound[]) {
  const base = rounds.findIndex((round) => round.ties.length <= TREE_TIES);
  if (base < 0) return undefined;
  const last = rounds.length - 1;
  const columns: { label: string; index?: number; slots: Slot[] }[] = [
    { label: rounds[last].label, index: last, slots: rounds[last].ties.map((_, tie) => ({ tie })) },
  ];
  for (let r = last - 1; r >= base; r--) {
    const where = new Map<string, number>();
    rounds[r].ties.forEach((tie, t) => {
      where.set(tie.home, t);
      where.set(tie.away, t);
    });
    const slots: Slot[] = [];
    for (const slot of columns[0].slots) {
      if (!slot || !('tie' in slot)) {
        slots.push(undefined, undefined);
        continue;
      }
      const tie = rounds[r + 1].ties[slot.tie];
      for (const club of [tie.home, tie.away]) {
        const from = where.get(club);
        slots.push(from === undefined ? { bye: club } : { tie: from });
      }
    }
    columns.unshift({ label: rounds[r].label, index: r, slots });
  }
  // Rounds still to come halve until the final.
  for (let ties = Math.ceil(rounds[last].ties.length / 2); ; ties = Math.ceil(ties / 2)) {
    if (rounds[last].ties.length === 1) break;
    columns.push({
      label: roundLabel(ties * 2, rounds.length + columns.length),
      slots: Array.from({ length: ties }, () => undefined),
    });
    if (ties === 1) break;
  }
  return columns;
}
function TreeTie({
  w,
  round,
  index,
  slot,
  fixtures,
  competition,
}: {
  w: World;
  round?: KnockoutRound;
  index?: number;
  slot: Slot;
  fixtures: Fixture[];
  competition: string;
}) {
  if (!slot || !round || index === undefined)
    return (
      <li className={c.treeEmpty}>{slot && 'bye' in slot ? nameOf(w, slot.bye) : '추첨 전'}</li>
    );
  if ('bye' in slot)
    return (
      <li className={c.treeTie}>
        <Club w={w} id={slot.bye} strong />
        <small>부전승</small>
      </li>
    );
  const tie = round.ties[slot.tie],
    legs = legsOf(w, fixtures, competition, index, slot.tie),
    played = legs.some((f) => f.score),
    [home, away] = tieAggregate(tie, legs),
    own = tie.home === w.playerClub || tie.away === w.playerClub;
  return (
    <li className={`${c.treeTie} ${own ? c.ownTie : ''}`}>
      <span>
        <Club w={w} id={tie.home} strong={tie.winner === tie.home} />
        <em>{played ? home : ''}</em>
      </span>
      <span>
        <Club w={w} id={tie.away} strong={tie.winner === tie.away} />
        <em>{played ? away : ''}</em>
      </span>
      {(tie.decided === 'pens' || tie.decided === 'away') && (
        <small>{tie.decided === 'pens' ? '승부차기' : '원정 다득점'}</small>
      )}
    </li>
  );
}
function BracketTree({
  w,
  rounds,
  fixtures,
  competition,
}: {
  w: World;
  rounds: KnockoutRound[];
  fixtures: Fixture[];
  competition: string;
}) {
  const columns = treeColumns(rounds);
  if (!columns)
    return (
      <p className={c.treeNote}>
        아직 초반 라운드예요. 32강부터 대진표가 채워지고, 지금은 목록에서 볼 수 있어요.
      </p>
    );
  return (
    <div className={c.tree} role="group" aria-label="대진표">
      {columns.map((column, col) => (
        <section key={`${column.label}-${col}`} className={c.treeColumn}>
          <h4>{column.label}</h4>
          <ul style={{ minHeight: `${columns[0].slots.length * 64}px` }}>
            {column.slots.map((slot, i) => (
              <TreeTie
                key={i}
                w={w}
                round={column.index === undefined ? undefined : rounds[column.index]}
                index={column.index}
                slot={slot}
                fixtures={fixtures}
                competition={competition}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A knockout as a tree or as rounds, latest first; long early rounds fold behind our tie. */
function Bracket(props: {
  w: World;
  rounds: KnockoutRound[];
  fixtures: Fixture[];
  competition: string;
}) {
  // The tree opens once it has drawn ties to show; early mass rounds read better as a list.
  const [view, setView] = useState<'tree' | 'list'>(() =>
    (props.rounds.at(-1)?.ties.length ?? 0) <= TREE_TIES ? 'tree' : 'list',
  );
  if (!props.rounds.length) return null;
  return (
    <>
      <div className={c.viewSwitch} role="group" aria-label="대진 보기">
        {(
          [
            ['tree', '대진표'],
            ['list', '라운드별'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {view === 'tree' ? <BracketTree {...props} /> : <RoundList {...props} />}
    </>
  );
}
/** Knockout rounds, latest first; long early rounds fold behind our tie. */
function RoundList({
  w,
  rounds,
  fixtures,
  competition,
}: {
  w: World;
  rounds: KnockoutRound[];
  fixtures: Fixture[];
  competition: string;
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!rounds.length) return null;
  return (
    <div className={c.bracket} aria-label="토너먼트 대진">
      {rounds
        .map((round, index) => ({ round, index }))
        .reverse()
        .map(({ round, index }) => {
          const decided = round.ties.filter((tie) => tie.winner).length;
          const long = round.ties.length > 8;
          const shown = long && !open[index];
          const ties = round.ties
            .map((tie, t) => ({ tie, t }))
            .filter(({ tie }) => !shown || tie.home === w.playerClub || tie.away === w.playerClub);
          const first = legsOf(w, fixtures, competition, index, 0)[0];
          return (
            <section key={index} className={c.round}>
              <header>
                <h4>{round.label}</h4>
                <span>
                  {first ? fixtureDate(w, first).replace(/^\d+년 /, '') : ''}
                  {round.legs === 2 ? ' · 홈앤드어웨이' : ' · 단판'} · {decided}/{round.ties.length}{' '}
                  경기 종료
                  {round.byes?.length ? ` · 부전승 ${round.byes.length}팀` : ''}
                </span>
              </header>
              <ul className={c.ties}>
                {ties.map(({ tie, t }) => (
                  <Tie key={t} w={w} tie={tie} legs={legsOf(w, fixtures, competition, index, t)} />
                ))}
              </ul>
              {long && (
                <button
                  className={c.more}
                  onClick={() => setOpen({ ...open, [index]: !open[index] })}
                >
                  {shown ? `${round.label} ${round.ties.length}경기 모두 보기` : '접기'}
                </button>
              )}
            </section>
          );
        })}
    </div>
  );
}

/** A league-phase or group table with its qualification zones. */
function PhaseTable({
  w,
  t,
  ids,
  zones,
  title,
}: {
  w: World;
  t: EuropeTournament;
  ids: string[];
  zones: { until: number; tone: 'direct' | 'playoff' | 'out'; label: string }[];
  title?: string;
}) {
  const [all, setAll] = useState(ids.length <= 8);
  const sorted = rankIds(t.standings, ids);
  const zoneOf = (rank: number) => zones.find((zone) => rank <= zone.until);
  return (
    <section className={c.phase}>
      {title && <h4>{title}</h4>}
      <table className={c.table} aria-label={title || `${t.name} 순위표`}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">클럽</th>
            <th scope="col">경기</th>
            <th scope="col">득실</th>
            <th scope="col">승점</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((id, i) => {
            if (!all && i >= 8 && id !== w.playerClub) return null;
            const row = t.standings[id] || emptyTable();
            const zone = zoneOf(i + 1);
            return (
              <tr
                key={id}
                className={`${zone ? c[zone.tone] : ''} ${id === w.playerClub ? c.ownRow : ''}`}
              >
                <td>{i + 1}</td>
                <td>
                  <Club w={w} id={id} />
                </td>
                <td>{row.played}</td>
                <td>{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td>
                <td>
                  <b>{row.points}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!all && (
        <button className={c.more} onClick={() => setAll(true)}>
          {sorted.length}팀 모두 보기
        </button>
      )}
      <p className={c.legend}>
        {zones
          .filter((zone) => zone.tone !== 'out')
          .map((zone) => (
            <span key={zone.label}>
              <i className={c[zone.tone]} /> {zone.label}
            </span>
          ))}
      </p>
    </section>
  );
}

/** Our standing in one competition, in one line a fan would say. */
function ownStatus(w: World, rounds: KnockoutRound[], fixtures: Fixture[], entered: boolean) {
  if (!entered) return '우리 클럽은 참가하지 않아요.';
  const reached = ownReached(w, rounds);
  const next = fixtures
    .filter((f) => !f.score && (f.home === w.playerClub || f.away === w.playerClub))
    .sort((a, b) => a.round - b.round)[0];
  if (reached?.champion) return '우승!';
  if (reached?.eliminated) return `${reached.label} 탈락`;
  if (next) {
    const home = next.home === w.playerClub;
    return `${reached ? `${reached.label} · ` : ''}다음 ${home ? '홈' : '원정'} ${nameOf(w, home ? next.away : next.home)} · ${fixtureDate(w, next).replace(/^\d+년 /, '')}`;
  }
  return reached ? `${reached.label} 진출` : '대진 추첨을 기다려요';
}

function DomesticCup({ w }: { w: World }) {
  const own = clubOf(w);
  const cup = w.cups?.find((entry) => entry.country === own.country);
  const name = cup?.name ?? domesticCupName(own.country);
  const titles = w.history.filter((h) =>
    h.champions.some((entry) => entry.country === own.country && entry.cup === w.playerClub),
  ).length;
  if (!cup)
    return (
      <section className={c.card}>
        <h3>{name}</h3>
        <p className={s.muted}>다음 시즌 시작과 함께 첫 라운드 대진을 추첨해요.</p>
      </section>
    );
  const entered = cup.clubs.includes(w.playerClub);
  return (
    <section className={c.card} aria-label={name}>
      <header className={c.cardHead}>
        <div>
          <h3>{name}</h3>
          <small>
            {seasonName(w.year)} · {cup.clubs.length}팀 단판 토너먼트 · 우승 {titles}회
          </small>
        </div>
        {cup.winner && (
          <span className={c.winnerPill}>
            우승 <Club w={w} id={cup.winner} />
          </span>
        )}
      </header>
      <p className={c.status}>{ownStatus(w, cup.rounds, cup.fixtures, entered)}</p>
      <Bracket
        w={w}
        rounds={cup.rounds}
        fixtures={cup.fixtures}
        competition={cupKey(cup.country)}
      />
      <p className={c.note}>
        리그 일정 사이 주중에 치러요(9월 1라운드 → 5월 결승). 하부 리그 클럽이 먼저 1라운드를 치르고
        상위 클럽은 다음 라운드부터 들어와요. 비기면 연장과 승부차기로 가려요.
      </p>
    </section>
  );
}

function Continental({ w, t }: { w: World; t: EuropeTournament }) {
  const entered = t.clubs.includes(w.playerClub);
  const rounds = t.rounds || [];
  const groups = phaseGroups(t, 'phase');
  const second = phaseGroups(t, 'second');
  const qualifyPerGroup = t.field === 40 ? 3 : t.field === 16 || t.field >= 32 ? 2 : 1;
  const status = !entered
    ? '우리 클럽은 참가하지 않아요. 리그 상위권이나 국내 컵 우승으로 출전권을 얻어요.'
    : t.winner === w.playerClub
      ? '우승!'
      : (t.ownExit ?? ownStatus(w, rounds, t.fixtures, true));
  return (
    <section className={c.card} aria-label={t.name}>
      <header className={c.cardHead}>
        <div>
          <h3>{t.name}</h3>
          <small>
            {seasonName(w.year)} · {t.field}팀 ·{' '}
            {t.format === 'league'
              ? `리그 페이즈 ${t.games}경기`
              : t.format === 'knockout'
                ? '토너먼트'
                : t.format === 'double-groups'
                  ? '조별 리그 2회'
                  : '조별 리그'}{' '}
            · 지금 {t.stage}
          </small>
        </div>
        {t.winner && (
          <span className={c.winnerPill}>
            우승 <Club w={w} id={t.winner} />
          </span>
        )}
      </header>
      <p className={c.status}>{status}</p>
      <Bracket w={w} rounds={rounds} fixtures={t.fixtures} competition={t.key} />
      {second.length > 0 &&
        second.map((ids, g) => (
          <PhaseTable
            key={`second-${g}`}
            w={w}
            t={t}
            ids={ids}
            title={`2차 조별 리그 ${String.fromCharCode(65 + g)}조`}
            zones={[{ until: 2, tone: 'direct', label: '8강 진출' }]}
          />
        ))}
      {t.format === 'league' && groups.length > 0 && (
        <PhaseTable
          w={w}
          t={t}
          ids={groups.flat()}
          title="리그 페이즈 순위"
          zones={[
            { until: 8, tone: 'direct', label: '1–8위 16강 직행' },
            { until: 24, tone: 'playoff', label: '9–24위 플레이오프' },
            { until: 36, tone: 'out', label: '탈락' },
          ]}
        />
      )}
      {t.format !== 'league' && groups.length > 0 && (
        <div className={c.groups}>
          {groups.map((ids, g) => (
            <PhaseTable
              key={g}
              w={w}
              t={t}
              ids={ids}
              title={`${String.fromCharCode(65 + g)}조`}
              zones={[{ until: qualifyPerGroup, tone: 'direct', label: '토너먼트 진출' }]}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function finalLine(w: World, winner: string, final?: CupFinal) {
  if (!final) return <Club w={w} id={winner} strong />;
  return (
    <>
      <Club w={w} id={winner} strong />
      <em>
        {final.score[0]}–{final.score[1]}
        {final.decided === 'pens' ? ' (승부차기)' : ''}
      </em>
      <Club w={w} id={final.runnerUp} />
    </>
  );
}

/** Winners and finals season by season, the most successful clubs and our runs. */
function CupHistory({ w }: { w: World }) {
  const own = clubOf(w);
  const competitions = [
    { key: 'cup', name: domesticCupName(own.country) },
    { key: 'ucl', name: 'European Cup / Champions League' },
    { key: 'uel', name: 'UEFA Cup / Europa League' },
    { key: 'uecl', name: 'Conference League' },
    { key: 'cwc', name: 'Cup Winners Cup' },
  ];
  const [key, setKey] = useState('cup');
  const seasons = [...w.history].reverse();
  const rows = seasons.flatMap((h) => {
    if (key === 'cup') {
      const entry = h.champions.find((ch) => ch.country === own.country);
      return entry?.cup
        ? [{ year: h.year, winner: entry.cup, final: entry.cupFinal, name: '' }]
        : [];
    }
    const e = h.europe.find((entry) => entry.kind === key);
    return e ? [{ year: h.year, winner: e.winner, final: e.final, name: e.name }] : [];
  });
  const titles = new Map<string, number>();
  for (const row of rows) titles.set(row.winner, (titles.get(row.winner) || 0) + 1);
  const leaders = [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const runs = seasons.flatMap((h) =>
    (h.runs || []).filter((run) => run.key === key).map((run) => ({ year: h.year, ...run })),
  );
  return (
    <section className={c.card} aria-label="컵 대회 역사">
      <div className={s.filters} role="tablist" aria-label="역사를 볼 대회">
        {competitions.map((entry) => (
          <button
            key={entry.key}
            role="tab"
            aria-selected={key === entry.key}
            className={key === entry.key ? s.selected : undefined}
            onClick={() => setKey(entry.key)}
          >
            {entry.key === 'cup' ? entry.name : entry.name.split(' / ').at(-1)}
          </button>
        ))}
      </div>
      {leaders.length > 0 && (
        <section className={c.leaders}>
          <h4>최다 우승</h4>
          <ol>
            {leaders.map(([club, count]) => (
              <li key={club}>
                <Club w={w} id={club} strong={club === w.playerClub} />
                <b>{number(count)}회</b>
              </li>
            ))}
          </ol>
        </section>
      )}
      {runs.length > 0 && (
        <section className={c.leaders}>
          <h4>우리 클럽의 도전</h4>
          <ol>
            {runs.slice(0, 12).map((run) => (
              <li key={run.year}>
                <span>{seasonName(run.year)}</span>
                <b className={run.champion ? c.champion : undefined}>
                  {run.champion ? '우승' : run.reached}
                </b>
              </li>
            ))}
          </ol>
        </section>
      )}
      {rows.length ? (
        <ul className={c.finals}>
          {rows.map((row) => (
            <li key={row.year} className={row.winner === w.playerClub ? c.ownTie : undefined}>
              <span>
                {seasonName(row.year)}
                {row.name && <small>{row.name}</small>}
              </span>
              <div>{finalLine(w, row.winner, row.final)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.muted}>
          아직 기록된 대회가 없어요.{' '}
          {key === 'cup' ? '첫 시즌이 끝나면 우승팀이 남아요.' : '대회가 창설되면 기록이 쌓여요.'}
        </p>
      )}
    </section>
  );
}

/** Cups: the domestic cup and the continental club competitions, live and in history (→WEB-40). */
export function CupsView({ w, coefficient }: { w: World; coefficient: number }) {
  const tabs = [
    { id: 'cup', label: domesticCupName(clubOf(w).country) },
    ...w.europe.filter((t) => t.key !== 'super').map((t) => ({ id: t.key, label: t.name })),
    { id: 'history', label: '역사' },
  ];
  const [tab, setTab] = useState('cup');
  const active = tabs.some((entry) => entry.id === tab) ? tab : 'cup';
  const tournament = w.europe.find((t) => t.key === active);
  const nextEurope = w.year < 1955 ? 1955 - w.year : 0;
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>CUP COMPETITIONS</div>
          <h2>컵 대회</h2>
          <p>
            {country(clubOf(w).country).name} 컵과 대륙 클럽대항전의 대진·순위·역사.
            {nextEurope > 0 && ` 유러피언컵은 ${nextEurope}년 후(1955/56) 창설돼요.`}
          </p>
        </div>
        <span className={s.pill}>최근 5시즌 구단 계수 · {number(coefficient)}점</span>
      </div>
      <div className={`${s.filters} ${c.tabs}`} role="tablist" aria-label="컵 대회">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={active === entry.id}
            className={active === entry.id ? s.selected : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {active === 'cup' && <DomesticCup w={w} />}
      {tournament && <Continental key={tournament.key} w={w} t={tournament} />}
      {active === 'history' && <CupHistory w={w} />}
      <p className={s.muted}>
        국가별 참가권, 시드와 추첨은 데모에 맞게 단순화했습니다. 클럽대항전은 9–1월 리그·조별 단계,
        2월부터 홈앤드어웨이 토너먼트, 5월 단판 결승으로 치르고 2021년 전까지는 원정 다득점 규칙을
        씁니다.
      </p>
    </>
  );
}
