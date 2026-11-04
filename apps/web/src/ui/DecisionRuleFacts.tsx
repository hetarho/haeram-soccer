import type { ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import { MANAGER_PRIORITY_INFO } from '../../../../packages/engine/src/hiring-info';
import { useOfficeRead } from './useOfficeRead';
import {
  annualWageLimit,
  financeStance,
  debutRule,
  releaseRule,
} from '../../../../packages/engine/src/direction';
import { SALE_BARS } from '../../../../packages/engine/src/transfer-policy';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { compactMoney } from './format';
import s from './OwnerOffice.module.css';

/** The actual criteria produced by the owner's instructions and this duty's spending limits. */
export function DecisionRuleFacts({
  w,
  responsibility,
}: {
  w: World;
  responsibility: ResponsibilityKey;
}) {
  const office = useOfficeRead(w);
  if (!office) return null;
  const finance = financeStance(w, responsibility === 'sponsors' ? undefined : responsibility);
  const rows: [string, string][] = [];
  if (responsibility === 'manager') {
    const rule = office.managerCriteria;
    rows.push(
      ['우선순위', MANAGER_PRIORITY_INFO[rule.priority]],
      ['기본 계약 기간', `${rule.term}시즌`],
      ['육성 최소', `${rule.minYouth}`],
      ['선호 학파', rule.schools.map((school) => STYLE_INFO[school].label).join(' · ') || '전체'],
      ['다른 구단 감독', rule.poach ? '보상금을 내고 영입 가능' : '자유계약만'],
      [
        '맞는 후보가 없을 때',
        rule.whenNone === 'best' ? '감당 가능한 최선의 자유계약 후보' : '대행 체제로 대기',
      ],
    );
  } else if (responsibility === 'staff') {
    const rule = office.coachCriteria;
    rows.push(
      ['최소 능력', rule.volunteer ? '능력 50 자원봉사' : `${rule.minAbility}`],
      ['우선순위', rule.priority === 'ability' ? '능력 높은 순' : '연봉 낮은 순'],
      ['기본 계약 기간', `${rule.term}시즌`],
    );
  } else if (responsibility === 'contracts') {
    const rule = office.talkRule;
    rows.push(
      ['연봉 수락 상한', `시장가의 ${Math.round(rule.maxPay * 100)}%`],
      ['붙잡을 선수', rule.startersOnly ? '주전 11명' : '전체'],
      ['나이 제한', rule.maxAge ? `${rule.maxAge}세 미만` : '없음'],
    );
  } else if (responsibility === 'recruitment') {
    rows.push(
      [
        '보강 기준',
        finance.signing.margin === undefined
          ? '빈자리만 보강'
          : `주전보다 ${finance.signing.margin} 이상 우수`,
      ],
      ['시장별 보강 상한', `${finance.signing.upgrades}명`],
      ['이적료 지출 상한', `여유 자금의 ${Math.round(finance.signing.feeShare * 100)}%`],
    );
  } else if (responsibility === 'sales') {
    const bar = SALE_BARS[w.build?.market ?? 'standard'];
    rows.push(
      ['일반 선수 수락선', `선수 가치의 ${bar[0]}%`],
      ['유망주 수락선', `선수 가치의 ${bar[1]}%`],
      ['자금 압박 구간', `고정비 ${finance.sellSteps[0]} / ${finance.sellSteps[1]}라운드분 미만`],
      ['추가 판단', '나이·남은 계약·주전 여부·대체 선수·선수별 이적 상태'],
    );
  } else if (responsibility === 'academy') {
    const debut = debutRule(w),
      release = releaseRule(w);
    rows.push(
      ['승격 재정 기준', `운영비 ${finance.promotionYears}년분 이상`],
      ['주전 대비 허용 격차', `${debut.startersMargin}`],
      ['최소 검토 나이', debut.fromAge ? `${debut.fromAge}세` : '별도 제한 없음'],
      [
        '방출 판단',
        Number.isFinite(release.age)
          ? `${release.age}세부터 잠재력이 같은 포지션 ${release.against === 'starters' ? '주전' : '1군 최하위'}에 못 미치면 방출`
          : '21세까지 육성 유지',
      ],
    );
  } else {
    rows.push(
      ['자동 선택', '열린 빈 후원 자리마다 보장 기본금이 가장 높은 안정형 계약'],
      ['계약 중 교체', '현재 계약이 끝난 뒤 새 계약'],
      ['직접 선택', '보장형·성과형·독점형·물가연동형 제안을 비교하고 계약'],
    );
  }
  if (responsibility !== 'sponsors' && responsibility !== 'sales') {
    const cap = annualWageLimit(w, responsibility);
    rows.push([
      '1인당 연봉 한도',
      cap === undefined ? '별도 상한 없음' : `${compactMoney(cap, clubOf(w).country, w.year)} / 년`,
    ]);
    if (responsibility !== 'academy')
      rows.push(['남길 운영 자금', `고정비 ${finance.runway}라운드분`]);
    if (responsibility === 'contracts' || responsibility === 'recruitment')
      rows.push(['임금 총액 한도', `연간 수입의 ${Math.round(finance.wageShare * 100)}%`]);
  }
  return (
    <details data-ui="disclosure" className={s.ruleFacts}>
      <summary>현재 지침에 따른 판단 기준</summary>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
