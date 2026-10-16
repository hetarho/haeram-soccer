import type { World } from '../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import type { RowKey } from './areas';
import type { BuildSlot } from '../../../../packages/contracts/src/build';
import s from './StrategyBoard.module.css';

/** Explain the existing policy's actor and execution point, without changing its rule. */
export function PolicyContext({ w, row }: { w: World; row: RowKey | BuildSlot }) {
  let text: string;
  if (row === 'recruitmentSupport') {
    text = `${isDelegated(w, 'recruitment') ? '단장이 자동 영입 중' : '지금은 직접 영입 · 자동 중재 시 사용'} · 실제 영입 갈등을 중재할 때 쓰는 지원 방침이에요. 선택만으로 약속이나 계약은 생기지 않고, 재정 한도는 바뀌지 않아요.`;
  } else if (row === 'manager' || row === 'school' || row === 'coaches') {
    const auto = isDelegated(w, row === 'coaches' ? 'staff' : 'manager');
    text = `${auto ? '스태프 자동 선임 기준' : '지금은 직접 선임 · 자동 위임 시 쓰는 기준'} · 다음 선임·재계약 때 판단해요. 현재 담당자는 바뀌지 않아요.`;
  } else if (row === 'renewal') {
    text = `${isDelegated(w, 'contracts') ? '단장이 사용 중' : '지금은 직접 협상 · 자동 위임 시 사용'} · 선수 재계약·계약 개선 요청에 답할 때 적용해요.`;
  } else if (row === 'youthGoal' || row === 'debut') {
    text = `${isDelegated(w, 'academy') ? '유스 디렉터가 사용 중' : '지금은 직접 결정 · 자동 위임 시 사용'} · 시즌 말 승격·방출 판단 기준이에요.${row === 'debut' ? ' 성장 효과는 다음 라운드부터 반영해요.' : ''}`;
  } else if (row === 'recruitment' || row === 'scouting') {
    text = `적용하면 이적시장 후보에 반영해요. ${isDelegated(w, 'recruitment') ? '단장이 이 기준으로 영입해요.' : '선수 영입은 직접 결정해요.'}`;
  } else if (row === 'market') {
    text = `${isDelegated(w, 'sales') ? '단장이 사용 중' : '지금은 직접 결정 · 자동 위임 시 사용'} · 다른 구단의 제안에 답할 때 적용해요.`;
  } else if (row === 'academy' || row === 'youth') {
    text =
      '다음 유스 입단의 인원·잠재력과 라운드 성장에 반영해요. 투자 비용은 운영비로 계속 나가며, 시설 공사와는 별도예요.';
  } else if (row === 'finance') {
    text =
      '자동 위임한 협상·영입·승격·스태프 선임의 자금 판단 기준이에요. 적용만으로 계약이나 지출이 실행되지는 않아요.';
  } else {
    text =
      '적용한 방침의 효과와 반복 비용은 해당 경기·라운드 정산에 반영해요. 아래 비용과 효과를 확인하세요.';
  }
  return (
    <p className={s.context} data-testid={`policy-context-${row}`}>
      {text}
    </p>
  );
}
