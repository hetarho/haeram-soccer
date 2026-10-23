import { useRef, useState } from 'react';
import type { ResponsibilityKey } from '../../../../packages/contracts/src/types';
import { RESPONSIBILITY_KEYS, settingsOf } from '../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import {
  AWAY_LIMITS,
  useProgression,
  type AwayLimit,
  type ProgressionController,
} from '../runtime/progression';
import { Dialog } from './Dialog';
import { Select } from './Select';
import { FacilityArt } from './FacilityArt';
import { modeSwitchBlocked } from './progressMode';
import { RESPONSIBILITY_LABELS } from './intervention';
import {
  applyOfficeChange,
  officeBulkChange,
  officeProposal,
  type OfficeChange,
  type OfficeProposal,
} from './officeChanges';
import s from './OwnerOffice.module.css';
const DETAILS: Record<ResponsibilityKey, string> = {
  manager: '감독 선임·재계약',
  staff: '단장·스카우트·코치진의 선임·재계약',
  contracts: '선수 재계약·계약 개선',
  recruitment: '선수 영입·영입 협상',
  sales: '우리 선수에게 온 제안·매각 방침',
  academy: '유소년 승격과 방출',
  sponsors: '자리별 스폰서 계약',
};
const OBSERVATIONS = [
  ['matchEve', '경기 전날 보고', '위임하면 스태프가 경기를 치르고 결과를 전달해요.'],
  ['windowOpen', '이적시장 개장 보고', '위임하면 개장 보고 확인을 기다리지 않고 업무를 계속해요.'],
] as const;
function OfficeRow({
  label,
  detail,
  delegated,
  blocked,
  onSelect,
}: {
  label: string;
  detail: string;
  delegated: boolean;
  blocked: boolean;
  onSelect: (delegated: boolean) => void;
}) {
  return (
    <div className={s.row}>
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <div className={s.choices} role="group" aria-label={label} data-ui="choices">
        {([false, true] as const).map((value) => (
          <button
            key={String(value)}
            aria-pressed={delegated === value}
            disabled={blocked}
            onClick={() => {
              if (delegated !== value) onSelect(value);
            }}
          >
            {value ? '위임' : '보고받기'}
          </button>
        ))}
      </div>
    </div>
  );
}
export function PendingHandover({ proposal }: { proposal: OfficeProposal }) {
  if (!proposal.pending.length) return null;
  return (
    <section className={s.preview} aria-label="대기 업무 이관 미리보기">
      <h3>함께 넘길 대기 업무</h3>
      <ul>
        {proposal.pending.map((item) => (
          <li key={item.key}>
            {item.count > 0 && (
              <>
                대기 중인 {RESPONSIBILITY_LABELS[item.key]} {item.count}건도{' '}
                {item.to === 'delegated' ? '위임됩니다' : '보고받고 승인하게 됩니다'}.
              </>
            )}
            {(item.held ?? 0) > 0 && (
              <> 공동 승인 {item.held}건은 다른 업무의 구단주 승인이 필요해 대기해요.</>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function OwnerOffice({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const state = useGameState((state) => state),
    w = state.view!.world,
    settings = settingsOf(w);
  const background = useProgression(controller, (state) => state.background);
  const [proposal, setProposal] = useState<OfficeProposal>();
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const blocked = modeSwitchBlocked(state) || applying;
  const propose = (change: OfficeChange) => {
    if (blocked) return;
    controller.pause();
    setMessage('');
    setProposal(officeProposal(w, change));
  };
  const apply = async (next: OfficeProposal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setApplying(true);
    setMessage('');
    try {
      await applyOfficeChange(client, controller, next);
      setProposal(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '변경하지 못했어요. 다시 시도해 주세요.');
    } finally {
      inFlight.current = false;
      setApplying(false);
    }
  };
  const close = () => {
    if (!inFlight.current) {
      setProposal(undefined);
      setMessage('');
    }
  };
  const keys = proposal
    ? RESPONSIBILITY_KEYS.filter((key) => proposal.change.responsibilities?.[key] !== undefined)
    : [];
  const observations = proposal
    ? OBSERVATIONS.filter(([key]) => proposal.change.observations?.[key] !== undefined)
    : [];
  const delegated =
    proposal &&
    (keys.length > 0
      ? proposal.change.responsibilities?.[keys[0]] === 'delegated'
      : observations.length > 0 && proposal.change.observations?.[observations[0][0]] === false);
  const title = delegated ? '위임하겠습니다.' : '보고받겠습니다.';
  const delegatedCount =
    RESPONSIBILITY_KEYS.filter((key) => settings.responsibilities[key] === 'delegated').length +
    OBSERVATIONS.filter(([key]) => !settings.observations[key]).length;
  const totalCount = RESPONSIBILITY_KEYS.length + OBSERVATIONS.length;
  return (
    <div className={s.office} data-testid="owner-office">
      <div
        className={s.bulkActions}
        role="group"
        aria-label="전체 보고·위임 설정"
        data-ui="choices"
      >
        {(['direct', 'delegated'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={
              value === 'delegated' ? delegatedCount === totalCount : delegatedCount === 0
            }
            disabled={blocked}
            onClick={() => {
              const change = officeBulkChange(w, value);
              if (change) propose(change);
            }}
          >
            {value === 'delegated' ? '전체 위임' : '전체 보고받기'}
          </button>
        ))}
      </div>
      <FacilityArt kind="manager" world={w} className={s.hero} eager />
      {state.readonly && <p className={s.message}>읽기 전용 상태에서는 변경할 수 없어요.</p>}
      {message && !proposal && (
        <p role="alert" className={s.message}>
          {message}
        </p>
      )}
      <section data-surface="panel" className={s.section} aria-label="보고·위임 설정">
        <div className={s.sectionHead}>
          <h3>보고받기 / 위임</h3>
          <small>
            {delegatedCount} / {totalCount}개 위임
          </small>
        </div>
        <p>
          보고받기는 구단주의 확인·승인을 기다립니다. 위임은 스태프가 방침에 따라 처리하고 결과를
          보고합니다.
        </p>
        <div className={s.rows}>
          {OBSERVATIONS.map(([key, label, detail]) => (
            <OfficeRow
              key={key}
              label={label}
              detail={detail}
              delegated={!settings.observations[key]}
              blocked={blocked}
              onSelect={(delegated) =>
                void apply(officeProposal(w, { observations: { [key]: !delegated } }))
              }
            />
          ))}
          {RESPONSIBILITY_KEYS.map((key) => (
            <OfficeRow
              key={key}
              label={RESPONSIBILITY_LABELS[key]}
              detail={DETAILS[key]}
              delegated={settings.responsibilities[key] === 'delegated'}
              blocked={blocked}
              onSelect={(delegated) =>
                propose({ responsibilities: { [key]: delegated ? 'delegated' : 'direct' } })
              }
            />
          ))}
        </div>
      </section>
      {settings.mode === 'automatic' && (
        <section
          data-surface="panel"
          className={s.section}
          aria-label="자동 모드의 백그라운드 진행"
        >
          <h3>자리를 비운 동안</h3>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={background.hidden}
              disabled={blocked}
              onChange={(event) => controller.setBackground({ hidden: event.target.checked })}
            />
            부재 중에도 업무 계속
          </label>
          <label className={s.row}>
            <b>부재 중 업무 진행 한도</b>
            <Select
              aria-label="자리 비운 동안 진행 한도"
              disabled={blocked}
              value={background.away}
              onValueChange={(value) => controller.setBackground({ away: value as AwayLimit })}
            >
              {Object.entries(AWAY_LIMITS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        </section>
      )}
      {proposal && (
        <Dialog
          label={title}
          onClose={close}
          actions={
            <div className={s.actions}>
              <button disabled={applying} onClick={close}>
                취소
              </button>
              <button
                data-ui="primary"
                disabled={blocked || w.id !== proposal.id}
                onClick={() => void apply(proposal)}
              >
                {delegated ? '위임하기' : '보고받기'}
              </button>
            </div>
          }
        >
          <div className={s.confirmation} aria-busy={applying}>
            <FacilityArt
              kind={delegated ? 'staff' : 'manager'}
              world={w}
              className={s.hero}
              eager
            />
            <p>
              {[
                ...observations.map(([, label]) => label),
                ...keys.map((key) => RESPONSIBILITY_LABELS[key]),
              ].join(' · ')}
            </p>
            <strong>
              {delegated
                ? '담당 스태프에게 판단과 실행을 맡깁니다.'
                : '보고를 받고 필요한 사안은 제가 승인하겠습니다.'}
            </strong>
            <ul>
              {observations.map(([key, label, detail]) => (
                <li key={key}>
                  {label}: {delegated ? detail : '구단주의 확인을 기다립니다.'}
                </li>
              ))}
              {keys.map((key) => (
                <li key={key}>{DETAILS[key]}</li>
              ))}
            </ul>
            <p>
              {delegated
                ? '정해 둔 방침에 따라 처리하고 결과를 보고합니다.'
                : '결정이 필요한 사안은 제게 보고하고 승인을 기다립니다.'}
            </p>
            <PendingHandover proposal={proposal} />
            {message && (
              <p role="alert" className={s.message}>
                {message}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
