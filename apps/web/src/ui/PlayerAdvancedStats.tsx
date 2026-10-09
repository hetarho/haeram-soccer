import type { Player, World } from '../../../../packages/contracts/src/types';
import { PD, per90, playerAdvanced, share } from './advanced';
import { Term } from './Glossary';
import s from './Analysis.module.css';

/** A player's advanced production over the chosen scope, with totals and per-90 rates. */
export function PlayerAdvancedStats({
  w,
  player,
  scope,
}: {
  w: World;
  player: Player;
  scope: 'season' | 'career';
}) {
  const { matches, minutes, totals } = playerAdvanced(w, player.id, scope);
  if (!matches)
    return (
      <p className={s.note} data-testid="player-advanced">
        고급 지표(xG·xA·키패스 등)가 기록된 경기가 아직 없어요.
      </p>
    );
  const rows: [string, string, string, string][] = [
    ['xg', 'xG', (totals[PD.xg] / 100).toFixed(2), per90(totals[PD.xg] / 100, minutes)],
    ['xa', 'xA', (totals[PD.xa] / 100).toFixed(2), per90(totals[PD.xa] / 100, minutes)],
    ['key-pass', '키패스', String(totals[PD.keyPasses]), per90(totals[PD.keyPasses], minutes)],
    [
      'big-chance',
      '빅찬스 창출',
      String(totals[PD.bigChancesCreated]),
      per90(totals[PD.bigChancesCreated], minutes),
    ],
    [
      'final-third',
      '파이널 서드 패스',
      `${share(totals[PD.finalThirdCompleted], totals[PD.finalThirdPasses])} · ${totals[PD.finalThirdCompleted]}/${totals[PD.finalThirdPasses]}`,
      per90(totals[PD.finalThirdCompleted], minutes, 1),
    ],
    [
      'progressive',
      '전진 패스',
      String(totals[PD.progressivePasses]),
      per90(totals[PD.progressivePasses], minutes, 1),
    ],
    ['take-on', '드리블 시도', String(totals[PD.takeOns]), per90(totals[PD.takeOns], minutes, 1)],
    [
      'high-turnover',
      '하이 턴오버',
      String(totals[PD.highTurnovers]),
      per90(totals[PD.highTurnovers], minutes),
    ],
  ];
  return (
    <section className={s.advanced} aria-label="고급 지표" data-testid="player-advanced">
      <h4>고급 지표</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">지표</th>
            <th scope="col">합계</th>
            <th scope="col">90분당</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([term, label, total, rate]) => (
            <tr key={term}>
              <th scope="row">
                <Term id={term}>{label}</Term>
              </th>
              <td>{total}</td>
              <td>{rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={s.note}>
        고급 지표가 기록된 {matches}경기 · {minutes}분 기준
        {minutes < 180 ? ' · 표본이 적어 비율이 크게 흔들릴 수 있어요' : ''}
      </p>
    </section>
  );
}
