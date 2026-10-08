import { useEffect, useRef, useState } from 'react';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { useNavigation } from './state';
import { Dialog } from './Dialog';
import { StrategyPanel } from './StrategyPanel';
import { TrainingStudio } from './TrainingStudio';
import { BusinessWorkbench } from './BusinessWorkbench';
import Rich from './Rich';
import s from './QuickActions.module.css';

const actions = [
  [
    'preparation',
    '전술·선발 준비',
    '상대 분석부터 다음 경기 선발까지',
    'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  ],
  ['training', '훈련·회복', '육성과 피로 회복의 균형 선택', 'M12 3v18M3 12h18M6 6l12 12M6 18L18 6'],
  [
    'squad',
    '선수단·영입',
    '선수 지표를 보고 필요한 전력 보강',
    'M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 21v-5a7 7 0 0 1 14 0v5',
  ],
  ['business', '클럽 투자', '시설·후원·마케팅·티켓 운영', 'M3 18l6-6 4 3 8-11M15 4h6v6'],
] as const;
type Tool = (typeof actions)[number][0];

export function QuickActions({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const state = useGameState((state) => state);
  const page = useNavigation((state) => state.page);
  const [menu, setMenu] = useState(false);
  const [tool, setTool] = useState<Tool>();
  const [preparing, setPreparing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const opening = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const active = menu || !!tool;
  const blocked = state.busy || state.readonly || !!state.error || !!state.view?.world.critical;
  useEffect(() => {
    const dialogs = new Set<string>();
    const change = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; open: boolean }>).detail;
      if (detail.open) dialogs.add(detail.id);
      else dialogs.delete(detail.id);
      setDialogOpen(dialogs.size > 0);
    };
    window.addEventListener('haeram:dialog', change);
    return () => window.removeEventListener('haeram:dialog', change);
  }, []);
  useEffect(() => {
    controller.setSuspended(active, 'quick-actions');
    return () => controller.setSuspended(false, 'quick-actions');
  }, [active, controller]);
  useEffect(
    () => () => {
      opening.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!active && !dialogOpen && restoreFocus.current) {
      restoreFocus.current = false;
      launcher.current?.focus({ preventScroll: true });
    }
  }, [active, dialogOpen]);
  const close = () => {
    opening.current = false;
    setMenu(false);
    setTool(undefined);
    restoreFocus.current = true;
  };
  const open = () => {
    controller.stop('빠른 메뉴에서 클럽을 준비하는 동안 진행을 멈췄습니다.');
    controller.setSuspended(true, 'quick-actions');
    opening.current = true;
    setPreparing(true);
    setMenu(true);
    void client.whenIdle().then(() => {
      if (opening.current) setPreparing(false);
    });
  };
  const w = state.view!.world;
  const note =
    page === 'match'
      ? '현재 관전 경기는 확정된 결과를 재생합니다. 전술·선발·훈련 변경은 다음 경기부터 적용돼요.'
      : '보던 화면은 그대로 두고 클럽을 준비하세요. 닫은 뒤 자동 진행은 직접 다시 시작할 수 있어요.';
  return (
    <>
      <button
        ref={launcher}
        className={s.launcher}
        aria-label="빠른 관여"
        aria-haspopup="dialog"
        aria-expanded={active}
        hidden={dialogOpen}
        disabled={blocked}
        onClick={(event) => {
          event.currentTarget.focus();
          open();
        }}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" />
        </svg>
        <span>빠른 관여</span>
      </button>
      {menu && (
        <Dialog label="빠른 관여" onClose={close} quick>
          <p className={s.note}>{note}</p>
          <div className={s.actions}>
            {actions.map(([id, label, detail, path]) => (
              <button
                key={id}
                disabled={blocked || preparing}
                onClick={() => {
                  setTool(id);
                  setMenu(false);
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d={path} />
                </svg>
                <span>
                  <b>{label}</b>
                  <small>{detail}</small>
                </span>
                <i aria-hidden="true">↗</i>
              </button>
            ))}
          </div>
          {preparing && <p role="status">현재 진행을 마치고 준비 도구를 열고 있어요…</p>}
        </Dialog>
      )}
      {tool === 'preparation' && (
        <StrategyPanel
          w={w}
          client={client}
          sheet
          onClose={close}
          onSuspendChange={(value) => controller.setSuspended(value, 'quick-preparation')}
        />
      )}
      {tool === 'training' && (
        <TrainingStudio w={w} client={client} onClose={close} onMarket={() => setTool('squad')} />
      )}
      {(tool === 'squad' || tool === 'business') && (
        <Dialog
          label={tool === 'squad' ? '빠른 선수단·영입' : '빠른 클럽 투자'}
          onClose={close}
          wide
          actions={<button onClick={close}>보던 화면으로 돌아가기</button>}
        >
          <p className={s.note}>{note}</p>
          {tool === 'squad' ? (
            <Rich state={state} client={client} page="squad" />
          ) : (
            <BusinessWorkbench state={state} client={client} />
          )}
        </Dialog>
      )}
    </>
  );
}
