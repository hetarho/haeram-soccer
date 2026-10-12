import { useEffect, useState } from 'react';
import type { GameEntry } from '../adapters/games';
import { summarize, type GameSlots } from '../runtime/slots';
import { gameStore, useGameState } from '../runtime/store';
import { CrestMark } from './ClubCrest';
import type { Crest } from './crests';
import { Dialog } from './Dialog';
import a from './App.module.css';
import s from './GameSlotScreen.module.css';

const gameStoreWorld = () => gameStore.getSnapshot().view?.world;

const played = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * The game slot screen (→WEB-62): three slots, each a club in progress or room for a new game.
 * The game in play shows its live summary; the others read what the index kept when they were
 * last played.
 */
export function GameSlotScreen({
  slots,
  onEnter,
  onNew,
  onExport,
}: {
  slots: GameSlots;
  onEnter: () => void;
  /** Readies the slot (parking the game in play) and opens founding for it. */
  onNew: (slot: number) => Promise<void>;
  onExport: (raw: string, label: string) => void;
}) {
  const world = useGameState((state) => state.view?.world);
  const readonly = useGameState((state) => state.readonly);
  const loading = useGameState((state) => state.busy && !state.view);
  const clientError = useGameState((state) => state.error);
  const [index, setIndex] = useState(() => slots.display(world));
  const refresh = () => setIndex(slots.display(gameStoreWorld()));
  // The loaded game joins the index (a save from before slots becomes slot 1).
  const worldId = world?.id;
  useEffect(() => {
    if (!worldId) return;
    slots.sync(gameStoreWorld());
    setIndex(slots.display(gameStoreWorld()));
  }, [slots, worldId]);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'overwrite'; slot: number }>();
  const busy = !!working || loading;
  const run = async (label: string, task: () => Promise<void>) => {
    setWorking(label);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setWorking('');
      refresh();
    }
  };
  const entryOf = (slot: number) => index.slots[slot];
  const live = (entry: GameEntry) =>
    world && entry.worldId === world.id ? summarize(world) : entry.summary;
  const exportSlot = (slot: number) =>
    run('기록을 꺼내는 중…', async () => {
      const raw = await slots.exportRaw(slot);
      if (!raw) throw new Error('이 슬롯의 기록을 찾지 못했어요.');
      onExport(raw, entryOf(slot)!.summary.club);
    });
  const importInto = (slot: number, file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError('파일 크기는 4 MiB 이하이어야 합니다.');
      return;
    }
    void run('기록을 가져오는 중…', async () => {
      await slots.importInto(slot, await file.text());
      onEnter();
    });
  };
  const locked = readonly || busy;
  return (
    <section className={s.screen} data-testid="game-slots" aria-label="게임 슬롯">
      <header className={s.head}>
        <span>HAERAM FOOTBALL</span>
        <h2>게임 슬롯</h2>
        <p>슬롯마다 다른 클럽을 키울 수 있어요. 기록은 이 브라우저에 저장돼요.</p>
      </header>
      {readonly && (
        <p className={s.note} role="status">
          다른 탭에서 플레이 중이에요. 이 탭에서는 진행 중인 게임을 읽기 전용으로만 볼 수 있어요.
        </p>
      )}
      {!slots.canPark && (
        <p className={s.note} role="status">
          이 브라우저는 게임 보관함(IndexedDB)을 지원하지 않아 진행 중인 게임 하나만 쓸 수 있어요.
        </p>
      )}
      {(error || clientError) && (
        <p className={s.error} role="alert">
          {error || clientError}
        </p>
      )}
      {working && (
        <p className={s.note} role="status">
          {working}
        </p>
      )}
      <ol className={s.list}>
        {index.slots.map((entry, slot) => {
          const label = `슬롯 ${slot + 1}`;
          if (!entry)
            return (
              <li key={slot} className={`${s.slot} ${s.empty}`} aria-label={`${label} · 빈 슬롯`}>
                <div className={s.slotHead}>
                  <span className={s.number}>{label}</span>
                  <b>빈 슬롯</b>
                </div>
                <div className={s.actions}>
                  <button
                    className={a.primary}
                    disabled={locked || (!!world && !slots.canPark)}
                    onClick={() => void run('새 게임을 준비하는 중…', async () => onNew(slot))}
                  >
                    새 게임
                  </button>
                  <label className={`${a.fileButton} ${locked ? s.disabled : ''}`}>
                    파일 가져오기
                    <input
                      className={a.fileInput}
                      type="file"
                      accept="application/json,.json"
                      disabled={locked || (!!world && !slots.canPark)}
                      onChange={(event) => {
                        importInto(slot, event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </li>
            );
          const summary = live(entry),
            inPlay = index.active === slot && !!world && world.id === entry.worldId;
          return (
            <li key={entry.id} className={`${s.slot} ${inPlay ? s.inPlay : ''}`} aria-label={label}>
              <div className={s.slotHead}>
                <span className={s.number}>{label}</span>
                {inPlay && <em>진행 중</em>}
              </div>
              <div className={s.club}>
                <CrestMark crest={summary.crest as Crest} size={40} />
                <div>
                  <b>{summary.club}</b>
                  <small>
                    {summary.country} · {summary.division}
                  </small>
                  <small>
                    {summary.seasons}번째 시즌 · {summary.date}
                  </small>
                  {played(entry.playedAt) && (
                    <small className={s.played}>최근 플레이 {played(entry.playedAt)}</small>
                  )}
                </div>
              </div>
              <div className={s.actions}>
                <button
                  className={a.primary}
                  disabled={busy || (readonly && !inPlay)}
                  onClick={() =>
                    void run('게임을 불러오는 중…', async () => {
                      await slots.continue(slot);
                      onEnter();
                    })
                  }
                >
                  {loading && index.active === slot ? '불러오는 중…' : '이어하기'}
                </button>
                <details className={s.more}>
                  <summary>관리</summary>
                  <div className={s.moreActions}>
                    <button disabled={busy} onClick={() => void exportSlot(slot)}>
                      내보내기
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => setConfirm({ kind: 'overwrite', slot })}
                    >
                      새 게임으로 덮어쓰기
                    </button>
                    <button disabled={locked} onClick={() => setConfirm({ kind: 'delete', slot })}>
                      삭제
                    </button>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
      {confirm && entryOf(confirm.slot) && (
        <Dialog
          label={confirm.kind === 'delete' ? '게임 삭제 확인' : '새 게임 덮어쓰기 확인'}
          onClose={() => setConfirm(undefined)}
        >
          <p>
            슬롯 {confirm.slot + 1}의 ‘{entryOf(confirm.slot)!.summary.club}’ 기록이 이 브라우저에서
            사라져요. 보관하려면 먼저 파일로 내보내세요.
          </p>
          <div className={a.actions}>
            <button onClick={() => void exportSlot(confirm.slot)}>기록 내보내기</button>
            <button onClick={() => setConfirm(undefined)}>취소</button>
            <button
              className={a.primary}
              onClick={() => {
                const { kind, slot } = confirm;
                setConfirm(undefined);
                void run(
                  kind === 'delete' ? '기록을 지우는 중…' : '새 게임을 준비하는 중…',
                  async () => {
                    if (kind === 'overwrite') return onNew(slot);
                    // The game in play leaves with its checkpoints; a fresh page reads what remains.
                    if (await slots.remove(slot)) location.reload();
                  },
                );
              }}
            >
              {confirm.kind === 'delete' ? '삭제' : '새 게임 시작'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
