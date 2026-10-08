import type { MatchRecord } from '../../../../packages/contracts/src/types';

export function observedRate(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    percent: denominator > 0 ? (100 * numerator) / denominator : undefined,
  };
}

export function matchRates(record: MatchRecord) {
  const [home, away] = record.metrics;
  const possession = home[11] + away[11];
  return [
    {
      label: '패스 정확도',
      home: observedRate(home[3], home[2]),
      away: observedRate(away[3], away[2]),
    },
    {
      label: '슈팅 정확도',
      home: observedRate(home[5], home[4]),
      away: observedRate(away[5], away[4]),
    },
    {
      label: '득점 전환율',
      home: observedRate(home[0], home[4]),
      away: observedRate(away[0], away[4]),
    },
    {
      label: '점유 시간 비율',
      home: observedRate(home[11], possession),
      away: observedRate(away[11], possession),
    },
  ];
}
