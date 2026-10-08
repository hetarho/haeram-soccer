import { Select } from './Select';
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Player, Tactic, World } from '../../../../packages/contracts/src/types';
import {
  activePlayers,
  clubOf,
  LINEUP_ROLES,
  lineupPreset,
  lineupSummary,
  nextOwnFixture,
  npcTactic,
  tacticalProfile,
  overall,
  quote,
  startingSquad,
  tacticLabel,
  tacticRequestOutlook,
} from '../../../../packages/engine/src/index';
import type { GameClient } from '../runtime/client';
import { gameStore, useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { money } from './format';
import { OpponentDossier } from './OpponentDossier';
import { TacticalLab } from './TacticalLab';
import s from './StrategyPanel.module.css';

type Props = {
  w: World;
  client: GameClient;
  onClose?: () => void;
};
type Tone = 'evidence' | 'respect' | 'support' | 'demand';
type PreparationTab = 'tactic' | 'lineup';

const styles: Record<Tactic, { advantage: string; tradeoff: string }> = {
  balanced: {
    advantage: '수비 안정성과 무리하지 않는 경기 운영.',
    tradeoff: '점유와 슛에 특화한 추가 이점은 적어요.',
  },
  possession: {
    advantage: '미드필더 패스로 볼을 오래 소유해요.',
    tradeoff: '직접 슛이 줄어요. 패스 능력이 낮으면 효과가 작아요.',
  },
  counter: {
    advantage: '수비와 공격수를 살려 압박 뒤 공간을 노려요.',
    tradeoff: '공을 내줘요. 상대가 내려서면 기회를 만들기 어려워요.',
  },
  press: {
    advantage: '체력 좋은 선발이 상대의 패스를 방해해요.',
    tradeoff: '피로 비용이 커요. 지친 선수단은 압박 효과가 떨어져요.',
  },
};
const roleNames: Record<Player['role'], string> = {
  GK: '골키퍼',
  DEF: '수비수',
  MID: '미드필더',
  FWD: '공격수',
};

function Preview({ players, baseline }: { players: Player[]; baseline: Player[] }) {
  const current = lineupSummary(players),
    before = lineupSummary(baseline);
  const values: { key: keyof typeof current; label: string }[] = [
    { key: 'strength', label: '선발 전력' },
    { key: 'fatigue', label: '평균 피로' },
    { key: 'attack', label: '공격수 마무리' },
    { key: 'keeper', label: 'GK 선방 능력' },
  ];
  return (
    <div className={s.preview} aria-label="선발 변경 영향">
      {values.map(({ key, label }) => (
        <div key={key}>
          <span>{label}</span>
          <strong>{current[key]}</strong>
          <small>
            {before[key] === current[key]
              ? '현재 선발과 같음'
              : `현재 ${before[key]} → ${current[key]}`}
          </small>
        </div>
      ))}
    </div>
  );
}

export const StrategyPanel = memo(function StrategyPanel({ w, client, onClose }: Props) {
  const acting = useGameState((state) => !!state.pendingActions);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  const tabId = useId();
  const [tab, setTab] = useState<PreparationTab>('tactic');
  const [preset, setPreset] = useState<'current' | 'strongest' | 'rest' | 'manual'>('current');
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const blocked = preparing || acting || readonly || !!error || !!w.critical;
  const [draft, setDraft] = useState<string[]>([]);
  const [tactic, setTactic] = useState<Tactic>(w.tactic);
  const [tone, setTone] = useState<Tone>('evidence');
  const [message, setMessage] = useState('');
  const opening = useRef(false);
  const onDismiss = useRef(onClose);
  onDismiss.current = onClose;
  useEffect(
    () => () => {
      opening.current = false;
    },
    [],
  );
  const close = useCallback(() => {
    opening.current = false;
    setOpen(false);
    onDismiss.current?.();
  }, []);
  const openPreparation = useCallback(() => {
    opening.current = true;
    setPreparing(true);
    setDraft([]);
    setTactic(gameStore.getSnapshot().view?.world.tactic || 'balanced');
    setPreset('current');
    setTab('tactic');
    setMessage('');
    setOpen(true);
    void client.whenIdle().then(() => {
      if (!opening.current) return;
      const current = gameStore.getSnapshot().view?.world;
      if (current) {
        setDraft(startingSquad(current, clubOf(current)).map((player) => player.id));
        setTactic(current.tactic);
      }
      setPreparing(false);
    });
  }, [client]);
  useEffect(() => {
    openPreparation();
  }, [openPreparation]);
  const baseline = startingSquad(w, clubOf(w));
  const players = activePlayers(w);
  const byId = new Map(players.map((player) => [player.id, player]));
  const selected = draft.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const valid =
    draft.length === 11 &&
    new Set(draft).size === 11 &&
    draft.every((id, i) => byId.get(id)?.role === LINEUP_ROLES[i]);
  const next = nextOwnFixture(w);
  const opponentId = next && (next.home === w.playerClub ? next.away : next.home);
  const opponent = w.clubs.find((club) => club.id === opponentId);
  const opponentTactic = opponent ? npcTactic(opponent) : undefined;
  const outlook = tacticRequestOutlook(w, tactic, tone);
  const supportCost = quote(clubOf(w).country, w.year, 30);
  const latestResponse = w.events.filter((event) => event.kind === 'manager-response').at(-1);
  const replaced = w.lineup?.filter((id) => !byId.has(id)).length || 0;
  const respond = async () => {
    if (blocked || outlook.alreadyAnswered) return;
    const reply = await client.command({ type: 'tactics', tactic, tone }, { background: true });
    if (!reply?.ok) {
      setMessage(client.state.error || '전술 요청을 적용하지 못했습니다.');
      return;
    }
    const updated = reply.view?.world;
    setMessage(
      updated?.events.filter((event) => event.kind === 'manager-response').at(-1)?.detail ||
        '감독의 답변을 확인하세요.',
    );
  };
  const saveLineup = async (ids: string[] | null) => {
    if (blocked || (ids && !valid)) return;
    const reply = await client.command({ type: 'lineup', ids }, { background: true });
    if (reply?.ok && reply.view) {
      if (ids === null) setPreset('current');
      setDraft(
        startingSquad(reply.view.world, clubOf(reply.view.world)).map((player) => player.id),
      );
      setMessage(
        ids
          ? '선발 11명을 저장했습니다. 다음 경기부터 변경할 때까지 적용합니다.'
          : '매 경기 능력과 피로에 따라 선발을 자동 구성합니다.',
      );
    } else setMessage(client.state.error || '선발 명단을 저장하지 못했습니다.');
  };
  const support = async () => {
    if (blocked || BigInt(w.cash) < BigInt(supportCost)) return;
    const reply = await client.command({ type: 'accept-condition' }, { background: true });
    setMessage(
      reply?.ok
        ? '훈련 지원과 전술 전환을 적용했습니다.'
        : client.state.error || '훈련 지원을 적용하지 못했습니다.',
    );
  };
  const selectTab = (value: PreparationTab) => setTab(value);
  return (
    <>
      {open && (
        <Dialog
          label="다음 경기 전술과 선발 준비"
          onClose={close}
          wide
          actions={
            <div className={s.footer}>
              {(message || (tab === 'tactic' && latestResponse)) && (
                <p className={s.message} role="status">
                  {message || latestResponse?.detail}
                </p>
              )}
              {tab === 'tactic' ? (
                <div className={s.actions}>
                  {w.manager.pending && (
                    <button
                      className={s.supportAction}
                      disabled={blocked || BigInt(w.cash) < BigInt(supportCost)}
                      onClick={() => void support()}
                    >
                      훈련 지원하고 전술 적용
                    </button>
                  )}
                  <button
                    className={s.primary}
                    disabled={blocked || outlook.alreadyAnswered}
                    onClick={() => void respond()}
                  >
                    감독에게 전술 요청
                  </button>
                  <button onClick={close}>준비 마치고 돌아가기</button>
                </div>
              ) : (
                <div className={s.actions}>
                  <button
                    className={`${s.primary} ${s.lineupAction}`}
                    disabled={blocked || !valid}
                    onClick={() => void saveLineup(draft)}
                  >
                    이 선발로 다음 경기 준비
                  </button>
                  <button disabled={blocked} onClick={() => void saveLineup(null)}>
                    감독의 자동 선발로 전환
                  </button>
                  <button onClick={close}>준비 마치고 돌아가기</button>
                </div>
              )}
            </div>
          }
        >
          {preparing && (
            <p className={s.hint} role="status">
              진행 중인 처리를 마치고 현재 선발을 불러오는 중…
            </p>
          )}
          <div className={s.opponent}>
            <span>다음 상대</span>
            <strong>{opponent?.name || '다음 시즌 일정 준비 중'}</strong>
            {opponent && (
              <p>
                전력 {opponent.strength} ·{' '}
                {next?.home === w.playerClub ? '우리 홈 경기' : '원정 경기'} · 상대 성향{' '}
                {opponentTactic && tacticLabel[opponentTactic]}
              </p>
            )}
          </div>
          <OpponentDossier w={w} />
          <div className={s.tabs} role="tablist" aria-label="경기 준비 선택">
            {(
              [
                ['tactic', '전술 선택'],
                ['lineup', '선발 선택'],
              ] as const
            ).map(([value, label], i) => (
              <button
                key={value}
                id={`${tabId}-${value}-tab`}
                role="tab"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                aria-controls={`${tabId}-${value}-panel`}
                onClick={() => selectTab(value)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const nextTab =
                    event.key === 'Home'
                      ? 'tactic'
                      : event.key === 'End'
                        ? 'lineup'
                        : i === 0
                          ? 'lineup'
                          : 'tactic';
                  selectTab(nextTab);
                  document.getElementById(`${tabId}-${nextTab}-tab`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id={`${tabId}-tactic-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-tactic-tab`}
            hidden={tab !== 'tactic'}
          >
            <section className={s.section} aria-label="경기 전술 준비">
              <div className={s.sectionHead}>
                <h3>경기 흐름 바꾸기</h3>
                <span>
                  실제 적용: <b>{tacticLabel[w.tactic]}</b>
                </span>
              </div>
              <div className={s.tactics}>
                {(Object.keys(styles) as Tactic[]).map((value) => (
                  <button
                    key={value}
                    disabled={blocked}
                    aria-pressed={tactic === value}
                    onClick={() => setTactic(value)}
                  >
                    <b>
                      {tacticLabel[value]}{' '}
                      <span className={s.fit}>
                        선발 적합도{' '}
                        {tacticalProfile(valid ? selected : baseline, value, opponentTactic).fit}
                        /100
                      </span>
                    </b>
                    <span>{styles[value].advantage}</span>
                    <small>{styles[value].tradeoff}</small>
                  </button>
                ))}
              </div>
              <p className={s.hint}>
                적합도는 현재 선발 능력과 피로의 요약입니다. 승리 확률이 아니며 상대와 홈·원정도
                결과에 영향을 줍니다.
              </p>
              <TacticalLab
                players={valid ? selected : baseline}
                applied={w.tactic}
                selected={tactic}
                opponent={opponentTactic}
                onSelect={setTactic}
              />
              <div className={s.negotiation}>
                <label>
                  감독에게 전달할 방식
                  <Select
                    aria-label="전술 요청 방식"
                    disabled={blocked}
                    value={tone}
                    onValueChange={(value) => setTone(value as Tone)}
                  >
                    <option value="evidence">선수단 근거로 설득</option>
                    <option value="respect">감독 판단 존중</option>
                    <option value="support">지원 약속</option>
                    <option value="demand">강하게 요구 · 신뢰 하락</option>
                  </Select>
                </label>
                <div className={s.outlook} aria-label="감독 예상 반응">
                  <span>예상 반응</span>
                  <b>{outlook.label}</b>
                  <small>
                    {w.manager.name} · 신뢰 {Math.round(w.manager.trust)} · 철학{' '}
                    {tacticLabel[w.manager.philosophy]}
                    {outlook.trustRisk > 0
                      ? tone === 'demand'
                        ? ` · 강한 요구: 신뢰 ${outlook.trustRisk} 감소`
                        : ` · 신뢰 최대 ${outlook.trustRisk} 감소 가능`
                      : ''}
                  </small>
                </div>
              </div>
              <p className={s.hint}>
                {outlook.alreadyAnswered
                  ? '이번 라운드에 이미 답한 조합입니다. 다음 라운드에 다시 제안할 수 있어요.'
                  : '성향과 신뢰에 따른 예상입니다. 실제 답변은 다를 수 있어요.'}
              </p>
              {w.manager.pending && (
                <div className={s.pending}>
                  <p>
                    {tacticLabel[w.manager.pending]} 조건부 수락 · 훈련 지원금{' '}
                    {money(supportCost, clubOf(w).country, w.year)}
                  </p>
                </div>
              )}
            </section>
          </div>
          <div
            id={`${tabId}-lineup-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-lineup-tab`}
            hidden={tab !== 'lineup'}
          >
            <section className={s.section} aria-label="선발 선수 준비">
              <div className={s.sectionHead}>
                <h3>선발 11명 고르기</h3>
                <span>GK 1 · DEF 4 · MID 3 · FWD 3</span>
              </div>
              <div className={s.presets}>
                <button
                  disabled={blocked}
                  aria-pressed={preset === 'strongest'}
                  onClick={() => {
                    setDraft(lineupPreset(w, 'strongest'));
                    setPreset('strongest');
                  }}
                >
                  전력 우선으로 선택
                </button>
                <button
                  disabled={blocked}
                  aria-pressed={preset === 'rest'}
                  onClick={() => {
                    setDraft(lineupPreset(w, 'rest'));
                    setPreset('rest');
                  }}
                >
                  피로 회복 우선으로 선택
                </button>
              </div>
              <Preview players={selected} baseline={baseline} />
              {replaced > 0 && (
                <p className={s.hint}>이탈한 선발 {replaced}명은 활동 중인 선수로 대체합니다.</p>
              )}
              <p className={s.hint}>
                능력과 피로를 함께 비교해요. 직접 정한 선발은 변경할 때까지 유지합니다.
              </p>
              <details className={s.slots}>
                <summary>선수별 교체</summary>
                <div className={s.lineup}>
                  {LINEUP_ROLES.map((role, slot) => (
                    <label key={slot}>
                      <span>
                        {roleNames[role]}{' '}
                        {role === 'GK' ? '' : slot - (role === 'DEF' ? 0 : role === 'MID' ? 4 : 7)}
                      </span>
                      <Select
                        disabled={blocked}
                        aria-label={`선발 ${slot + 1} ${roleNames[role]}`}
                        value={draft[slot] || ''}
                        onValueChange={(value) => {
                          setPreset('manual');
                          setDraft((current) => {
                            const updated = [...current],
                              displaced = updated.indexOf(value);
                            if (displaced >= 0 && displaced !== slot)
                              updated[displaced] = updated[slot];
                            updated[slot] = value;
                            return updated;
                          });
                        }}
                      >
                        <option value="" disabled>
                          선수를 선택하세요
                        </option>
                        {players
                          .filter((player) => player.role === role)
                          .sort((a, b) => overall(b) - overall(a) || a.id.localeCompare(b.id))
                          .map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.name} · 능력 {overall(player)} · 피로{' '}
                              {Math.round(player.fatigue)}
                            </option>
                          ))}
                      </Select>
                    </label>
                  ))}
                </div>
              </details>
              {!valid && (
                <p className={s.warning}>
                  포지션에 맞는 활동 중인 선수 11명이 필요합니다. 부족한 포지션은 선수단에서
                  보강하세요.
                </p>
              )}
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
});
