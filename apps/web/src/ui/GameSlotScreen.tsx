import { useEffect, useState } from 'react';
import type { GameEntry } from '../adapters/games';
import { earlierRules, summarize, type GameSlots } from '../runtime/slots';
import { gameStore, useGameState } from '../runtime/store';
import { CrestMark } from './ClubCrest';
import type { Crest } from './crests';
import { Dialog } from './Dialog';
import a from './App.module.css';
import s from './GameSlotScreen.module.css';
import { useLocale } from '../presentation/react';
import { PresentationSettingsTrigger } from './PresentationSettings';

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
  onRemovedInPlay,
}: {
  slots: GameSlots;
  onEnter: () => void;
  /** Readies the slot (parking the game in play) and opens founding for it. */
  onNew: (slot: number) => Promise<void>;
  onExport: (raw: string, label: string) => void;
  /** The game in play was deleted: a fresh page reads what remains, on this screen. */
  onRemovedInPlay: () => void;
}) {
  const { t } = useLocale();
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
  // A load that settles after the screen opened may have found an earlier-rules checkpoint in
  // play: the slots are read again once it does (→SAVE-16).
  useEffect(() => {
    if (!loading) setIndex(slots.display(gameStoreWorld()));
  }, [slots, loading, clientError]);
  // Games parked before slots kept their rules version learn it from their header (→SAVE-16).
  useEffect(() => {
    let live = true;
    void slots.resolveEngines().then((found) => {
      if (found && live) setIndex(slots.display(gameStoreWorld()));
    });
    return () => {
      live = false;
    };
  }, [slots]);
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
    run('slots.exporting', async () => {
      const raw = await slots.exportRaw(slot);
      if (!raw) throw new Error(t('slots.missingRecord'));
      onExport(raw, entryOf(slot)!.summary.club);
    });
  const importInto = (slot: number, file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('파일 크기는 8 MiB 이하이어야 합니다.');
      return;
    }
    void run('slots.importing', async () => {
      await slots.importInto(slot, await file.text());
      onEnter();
    });
  };
  const locked = readonly || busy;
  return (
    <section className={s.screen} data-testid="game-slots" aria-label={t('slots.title')}>
      <header className={s.head}>
        <span>HAERAM FOOTBALL</span>
        <h2>{t('slots.title')}</h2>
        <PresentationSettingsTrigger />
        <p>{t('slots.description')}</p>
      </header>
      {readonly && (
        <p className={s.note} role="status">
          {t('slots.readonly')}
        </p>
      )}
      {!slots.canPark && (
        <p className={s.note} role="status">
          {t('slots.storageUnavailable')}
        </p>
      )}
      {(error || clientError) && (
        <p className={s.error} role="alert">
          {error || clientError}
        </p>
      )}
      {working && (
        <p className={s.note} role="status">
          {t(working)}
        </p>
      )}
      <ol className={s.list}>
        {index.slots.map((entry, slot) => {
          const label = t('slots.label', { slot: slot + 1 });
          if (!entry)
            return (
              <li
                key={slot}
                className={`${s.slot} ${s.empty}`}
                aria-label={t('slots.emptyLabel', { label })}
              >
                <div className={s.slotHead}>
                  <span className={s.number}>{label}</span>
                  <b>{t('slots.empty')}</b>
                </div>
                <div className={s.actions}>
                  <button
                    className={a.primary}
                    disabled={locked || (!!world && !slots.canPark)}
                    onClick={() => void run('slots.preparing', async () => onNew(slot))}
                  >
                    {t('slots.new')}
                  </button>
                  <label className={`${a.fileButton} ${locked ? s.disabled : ''}`}>
                    {t('slots.import')}
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
          const earlier = earlierRules(entry);
          if (earlier)
            // A career of earlier rules never opens: it can be kept as a file or deleted (→SAVE-16).
            return (
              <li
                key={entry.id}
                className={`${s.slot} ${s.earlier}`}
                aria-label={t('slots.earlierLabel', { label })}
                data-testid={`slot-earlier-${slot}`}
              >
                <div className={s.slotHead}>
                  <span className={s.number}>{label}</span>
                  <em>{t('slots.earlierRules', { version: earlier })}</em>
                </div>
                <div className={s.club}>
                  <CrestMark crest={entry.summary.crest as Crest} size={40} />
                  <div>
                    <b>{entry.summary.club}</b>
                    {entry.summary.country && (
                      <small>
                        {entry.summary.country} · {entry.summary.division}
                      </small>
                    )}
                    {entry.summary.seasons > 0 && (
                      <small>
                        {t('slots.seasonDate', {
                          seasons: entry.summary.seasons,
                          date: entry.summary.date,
                        })}
                      </small>
                    )}
                    <small className={s.played}>
                      {t('slots.earlierNotice', { version: earlier })}
                    </small>
                  </div>
                </div>
                <div className={s.actions}>
                  <button disabled={busy} onClick={() => void exportSlot(slot)}>
                    {t('slots.export')}
                  </button>
                  <button disabled={locked} onClick={() => setConfirm({ kind: 'delete', slot })}>
                    {t('slots.delete')}
                  </button>
                </div>
              </li>
            );
          return (
            <li key={entry.id} className={`${s.slot} ${inPlay ? s.inPlay : ''}`} aria-label={label}>
              <div className={s.slotHead}>
                <span className={s.number}>{label}</span>
                {inPlay && <em>{t('slots.inPlay')}</em>}
              </div>
              <div className={s.club}>
                <CrestMark crest={summary.crest as Crest} size={40} />
                <div>
                  <b>{summary.club}</b>
                  <small>
                    {summary.country} · {summary.division}
                  </small>
                  <small>
                    {t('slots.seasonDate', { seasons: summary.seasons, date: summary.date })}
                  </small>
                  {played(entry.playedAt) && (
                    <small className={s.played}>
                      {t('slots.lastPlayed', { date: played(entry.playedAt) })}
                    </small>
                  )}
                </div>
              </div>
              <div className={s.actions}>
                <button
                  className={a.primary}
                  disabled={busy || (readonly && !inPlay)}
                  onClick={() =>
                    void run('slots.loadingGame', async () => {
                      await slots.continue(slot);
                      onEnter();
                    })
                  }
                >
                  {t(loading && index.active === slot ? 'slots.loading' : 'slots.continue')}
                </button>
                <details className={s.more}>
                  <summary>{t('slots.manage')}</summary>
                  <div className={s.moreActions}>
                    <button disabled={busy} onClick={() => void exportSlot(slot)}>
                      {t('slots.export')}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => setConfirm({ kind: 'overwrite', slot })}
                    >
                      {t('slots.overwrite')}
                    </button>
                    <button disabled={locked} onClick={() => setConfirm({ kind: 'delete', slot })}>
                      {t('slots.delete')}
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
          label={t(confirm.kind === 'delete' ? 'slots.confirmDelete' : 'slots.confirmOverwrite')}
          onClose={() => setConfirm(undefined)}
        >
          <p>
            {t('slots.removeNotice', {
              slot: confirm.slot + 1,
              club: entryOf(confirm.slot)!.summary.club,
            })}
          </p>
          <div className={a.actions}>
            <button onClick={() => void exportSlot(confirm.slot)}>{t('save.export')}</button>
            <button onClick={() => setConfirm(undefined)}>{t('common.cancel')}</button>
            <button
              className={a.primary}
              onClick={() => {
                const { kind, slot } = confirm;
                setConfirm(undefined);
                void run(kind === 'delete' ? 'slots.deleting' : 'slots.preparing', async () => {
                  if (kind === 'overwrite') return onNew(slot);
                  // The game in play leaves with its checkpoints; the slot screen stays.
                  if (await slots.remove(slot)) onRemovedInPlay();
                });
              }}
            >
              {t(confirm.kind === 'delete' ? 'slots.delete' : 'slots.startNew')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
