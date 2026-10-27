import type { ClubGoal } from '../../../../packages/engine/src/goals';
import { Dialog } from './Dialog';
import s from './PlayGuide.module.css';
export function PlayGuide({ goals, onClose }: { goals: ClubGoal[]; onClose: () => void }) {
  const done = (id: string) => goals.some((goal) => goal.id === id && goal.done);
  return (
    <Dialog
      label="클럽 키우기 가이드"
      onClose={onClose}
      actions={
        <button data-ui="primary" className={s.close} onClick={onClose}>
          가이드 확인 마치기
        </button>
      }
    >
      <div className={s.intro}>
        <span>한 경기씩, 우리만의 방향.</span>
        <h2>쉬운 조작, 깊어지는 선택.</h2>
        <p>
          감독에게 맡겨 바로 출발해도 좋아요. 더 높은 성과에는 선수·전술·피로·자금의 조합이
          필요해요.
        </p>
      </div>
      <ol className={s.steps}>
        <li>
          <b>01</b>
          <div>
            <h3>다음 경기를 준비해요 {done('preparation') && <span>완료 ✓</span>}</h3>
            <p>
              홈이나 경기 화면의 전술·선발에서 상대와 우리 선수를 비교해요. 전력 우선과 피로 회복
              우선 선발은 선택하고 저장하면 끝!
            </p>
          </div>
        </li>
        <li>
          <b>02</b>
          <div>
            <h3>한 번 눌러 경기로 {done('debut') && <span>완료 ✓</span>}</h3>
            <p>
              내일 경기 이벤트의 관전하기나 전체 메뉴의 다음 경기 관전을 누르면 킥오프해요. 관전
              속도를 바꿔도 결과는 같아요. 상단 ▶ 버튼은 고른 속도로 시즌을 자동 진행해요.
            </p>
          </div>
        </li>
        <li>
          <b>03</b>
          <div>
            <h3>내일의 전력을 키워요 {done('player-growth') && <span>완료 ✓</span>}</h3>
            <p>
              선수단에서 선수 영입과 스태프 계약을, 훈련·육성에서 1군 훈련과 유소년을 다뤄요. 구단주
              사무실의 업무 데스크에서 기준과 투자를 정해요. 각 항목을 누르면 비용과 효과를 먼저
              보여주고, 적용해야 반영돼요.
            </p>
          </div>
        </li>
      </ol>
      <p className={s.note}>
        성장 목표는 실제 기록에서 쌓여요. 전술에는 상대와 선수에 따른 약점이 있고, 승리는 보장되지
        않아요.
      </p>
    </Dialog>
  );
}
