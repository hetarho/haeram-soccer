import { useEffect, useRef, useState } from 'react';
import type { ClubIdentity } from '../../../../packages/contracts/src/identity';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked, gameStore, useGameState } from '../runtime/store';
import { CrestMark } from './ClubCrest';
import { ClubIdentityEditor } from './ClubIdentityEditor';
import { cloneIdentity } from './clubIdentityDraft';
import { useTaskState } from './taskMemory';
import s from './ClubDesignView.module.css';

/**
 * WEB-39/71/86, KIT-9/10/12: 구단주 사무실 › 구단 디자인, the one career editor of the club's design
 * (spec/ssot/KIT.md). Edits are a draft kept per career in task memory, so ordinary
 * detours keep it and another game never sees it (WEB-74); only 적용 sends the one `club-identity`
 * command, and only 되돌리기 or a successful apply clears it.
 */

/** An unapplied design: the identity applied when it began, and the edited one. */
export interface ClubDesignDraft {
  worldId: string;
  entry: ClubIdentity;
  draft: ClubIdentity;
}
/** The task-memory key a career keeps its design draft under. */
export const CLUB_DESIGN_DRAFT = 'club-identity-draft';

const designKey = (identity: ClubIdentity) => JSON.stringify(cloneIdentity(identity));
/** Whether two identities are the same design, whatever their object identity or key order. */
export const sameIdentity = (a: ClubIdentity, b: ClubIdentity) => designKey(a) === designKey(b);

/**
 * What the editor shows for the applied identity and a kept draft. Another game's draft is not
 * this one's. A draft is stale once the applied identity is no longer the one it began from —
 * compared as designs, never by world revision, which every ordinary day advances.
 */
export function clubDesignState(
  work: ClubDesignDraft | null,
  worldId: string,
  applied: ClubIdentity,
) {
  const draft = work?.worldId === worldId ? work : null;
  return {
    draft,
    value: draft?.draft ?? applied,
    changed: !!draft && !sameIdentity(draft.draft, draft.entry),
    stale: !!draft && !sameIdentity(draft.entry, applied),
  };
}
/**
 * The draft once `sent` is applied: done if it still holds `sent`, else (edited while the command
 * was queued) kept, now starting from `sent`.
 */
export function afterApply(work: ClubDesignDraft | null, sent: ClubIdentity) {
  if (!work || sameIdentity(work.draft, sent)) return null;
  return { ...work, entry: sent };
}

export function ClubDesignView({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world;
  const applied = identityOf(w, w.playerClub);
  const readonly = useGameState((current) => current.readonly);
  const blocked = useGameState(gameActionsBlocked);
  const [work, setWork] = useTaskState<ClubDesignDraft | null>(w.id, CLUB_DESIGN_DRAFT, null);
  const [pending, setPending] = useState(false);
  const design = clubDesignState(work, w.id, applied);
  const { draft, value, changed } = design;
  // While an apply is in flight the new design arrives before its draft clears; that is not stale.
  const stale = design.stale && !pending;
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const edit = (next: ClubIdentity) => {
    setNotice(undefined);
    setWork((current) => ({
      worldId: w.id,
      // A copy of the design applied when the draft began: 되돌리기 returns to it (WEB-86).
      entry: current?.worldId === w.id ? current.entry : cloneIdentity(applied),
      draft: next,
    }));
  };
  const discard = () => {
    setNotice(undefined);
    setWork(null);
  };
  const apply = async () => {
    if (!draft || !changed || stale || blocked || pending) return;
    const worldId = w.id;
    const sent = draft.draft;
    setPending(true);
    setNotice(undefined);
    // The existing queue carries the current revision and saves the decision (→SAVE-6/8).
    const reply = await client.command({ type: 'club-identity', identity: sent });
    // Another game came into play meanwhile: its task memory is not this answer's to change
    // (WEB-74), and this view, keyed by game, is gone.
    if (gameStore.getSnapshot().view?.world.id !== worldId) return;
    if (reply?.ok) setWork((current) => afterApply(current, sent));
    if (!mounted.current) return;
    setPending(false);
    setNotice(
      reply?.ok
        ? { error: false, text: '구단 디자인을 적용했어요.' }
        : {
            error: true,
            text: `구단 디자인을 적용하지 못했어요. 초안과 지금 디자인은 그대로예요. ${client.state.error ?? ''}`.trim(),
          },
    );
  };

  const status = readonly
    ? '읽기 전용'
    : pending
      ? '적용하는 중…'
      : changed
        ? '적용 전 초안'
        : '적용된 디자인';
  return (
    <section className={s.view} aria-label="구단 디자인">
      <div
        data-surface="panel"
        className={s.bar}
        role="group"
        aria-label="구단 디자인 적용"
        data-changed={changed || undefined}
      >
        <div className={s.row}>
          <CrestMark crest={applied.crest} size={24} label="지금 적용된 엠블럼" />
          <b className={s.status} role="status">
            {status}
          </b>
          <div className={s.actions}>
            <button type="button" disabled={!draft || pending} onClick={discard}>
              되돌리기
            </button>
            <button
              data-ui="primary"
              type="button"
              className={s.apply}
              disabled={!changed || stale || blocked || pending}
              onClick={() => void apply()}
            >
              적용
            </button>
          </div>
        </div>
        {stale ? (
          <div className={s.alert} role="alert">
            <p>
              이 초안을 고르는 사이 적용된 구단 디자인이 바뀌었어요. 새 디자인을 덮어쓰지 않도록
              적용을 막았어요.
            </p>
            <button type="button" onClick={discard}>
              지금 적용된 디자인 불러오기
            </button>
          </div>
        ) : notice?.error ? (
          <div className={s.alert} role="alert">
            <p>{notice.text}</p>
            <div className={s.actions}>
              <button type="button" disabled={pending || blocked} onClick={() => void apply()}>
                다시 적용
              </button>
              <button type="button" onClick={discard}>
                지금 적용된 디자인 불러오기
              </button>
            </div>
          </div>
        ) : (
          notice && <p className={s.done}>{notice.text}</p>
        )}
      </div>
      <p className={s.note} role={readonly ? 'note' : undefined}>
        {readonly
          ? '읽기 전용 상태에서는 구단 디자인을 적용할 수 없어요. 지금 디자인은 그대로 볼 수 있어요.'
          : '바꾼 디자인은 적용하기 전까지 이 게임의 초안이에요. 다른 화면에 다녀와도 남고, 되돌리기로 버려요. 적용하면 지금 구단 화면과 아직 치르지 않은 경기에 바로 쓰이고, 이미 치른 경기는 그때 입은 유니폼 그대로예요.'}
      </p>
      <ClubIdentityEditor value={value} onChange={edit} readonly={readonly} />
    </section>
  );
}
