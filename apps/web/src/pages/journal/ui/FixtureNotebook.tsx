import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { Select } from '../../../shared/ui/Select';
import { Card } from '../../../shared/ui/Card';
import { ClubLink } from '../../../entities/club';
import { Suspense, useEffect, useState } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import type { GameClient } from '../../../runtime/client';
import { fixtureDate, nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import { ownSeasonFixtures } from '../../../entities/league';
import { resultFor } from '../../../entities/league';
import { competitionLabel, kindLabel } from '../../../presentation/format';
import { Dialog } from '../../../shared/ui/Dialog';
import { MatchMaterial, MatchReport } from '../../../features/match-viewer';
import s from '../../../shared/ui/styles/Analysis.module.css';

export function FixtureNotebook({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
  const [scope, setScope] = useState('upcoming'),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState('all'),
    [venue, setVenue] = useState('all'),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{
    id: string;
    year: number;
    view: 'report' | 'material';
  }>();
  const [loaded, setLoaded] = useState<{ id: string; record?: MatchRecord; error?: string }>();
  useEffect(() => {
    setPage(0);
  }, [w.year]);
  useEffect(() => {
    if (!selected) return;
    let valid = true;
    void client
      .archive(selected.year)
      .then((data) => {
        if (!valid) return;
        const record = data?.matches.find((m) => m.id === selected.id);
        setLoaded({
          id: selected.id,
          record,
          error: record ? undefined : sourceMessage('copy.FixtureNotebook.9ecddf6891'),
        });
      })
      .catch(() => {
        if (valid)
          setLoaded({ id: selected.id, error: sourceMessage('copy.FixtureNotebook.12c42bae56') });
      });
    return () => {
      valid = false;
    };
  }, [client, selected]);
  const fixtures = ownSeasonFixtures(w).filter(
    (f) =>
      (scope === 'all' || (scope === 'completed' ? !!f.score : !f.score)) &&
      (kind === 'all' || f.kind === kind) &&
      (venue === 'all' || (venue === 'home' ? f.home === w.playerClub : f.away === w.playerClub)),
  );
  const last = Math.max(0, Math.ceil(fixtures.length / 20) - 1),
    current = Math.min(page, last),
    next = nextOwnFixture(w);
  const detail = loaded?.id === selected?.id ? loaded : undefined;
  return (
    <>
      <details
        data-ui="disclosure"
        data-surface="sheet"
        data-component="fixture-notebook"
        className={s.disclosure}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>{richMessage('copy.FixtureNotebook.dd5ad63c8d')}</summary>
        {localizeValue(
          open && (
            <section
              className={s.content}
              aria-label={displayMessage('copy.FixtureNotebook.dd5ad63c8d')}
            >
              <div className={s.controls}>
                <label>
                  {richMessage('copy.FixtureNotebook.e3dae42678', {
                    p0: ' ',
                    p1: (
                      <Select
                        aria-label={displayMessage('copy.FixtureNotebook.f393e10539')}
                        value={scope}
                        onValueChange={(value) => {
                          setScope(value);
                          setPage(0);
                        }}
                      >
                        <option value="upcoming">
                          {richMessage('copy.FixtureNotebook.935c2e5e1a')}
                        </option>
                        <option value="completed">
                          {richMessage('copy.FixtureNotebook.42d379b200')}
                        </option>
                        <option value="all">
                          {richMessage('copy.FixtureNotebook.1474153e3a')}
                        </option>
                      </Select>
                    ),
                  })}
                </label>
                <label>
                  {richMessage('copy.FixtureNotebook.a2bed9e9b0', {
                    p0: ' ',
                    p1: (
                      <Select
                        aria-label={displayMessage('copy.FixtureNotebook.7cdb680f13')}
                        value={kind}
                        onValueChange={(value) => {
                          setKind(value);
                          setPage(0);
                        }}
                      >
                        <option value="all">
                          {richMessage('copy.FixtureNotebook.4be0674739')}
                        </option>
                        {localizeValue(
                          Object.entries(kindLabel).map(([id, label]) => (
                            <option key={id} value={id}>
                              {localizeValue(label)}
                            </option>
                          )),
                        )}
                      </Select>
                    ),
                  })}
                </label>
                <label>
                  {richMessage('copy.FixtureNotebook.2628acfcbf', {
                    p0: ' ',
                    p1: (
                      <Select
                        aria-label={displayMessage('copy.FixtureNotebook.3abbc94803')}
                        value={venue}
                        onValueChange={(value) => {
                          setVenue(value);
                          setPage(0);
                        }}
                      >
                        <option value="all">
                          {richMessage('copy.FixtureNotebook.ca3fc2978f')}
                        </option>
                        <option value="home">{richMessage('fixture.home')}</option>
                        <option value="away">{richMessage('fixture.away')}</option>
                      </Select>
                    ),
                  })}
                </label>
              </div>
              <p className={s.note}>
                {richMessage('copy.FixtureNotebook.89baa69a31', { p0: fixtures.length })}
              </p>
              <div className={s.cards}>
                {localizeValue(
                  fixtures.slice(current * 20, (current + 1) * 20).map((f) => {
                    const ownHome = f.home === w.playerClub,
                      opponent = w.clubs.find((c) => c.id === (ownHome ? f.away : f.home)),
                      result = resultFor(f, w.playerClub);
                    return (
                      <Card
                        key={f.id}
                        data-testid="fixture-card"
                        data-next={f.id === next?.id || undefined}
                        meta={
                          <>
                            {localizeValue(fixtureDate(w, f))} ·{' '}
                            {localizeValue(competitionLabel(w, f))} ·{' '}
                            {localizeValue(
                              ownHome
                                ? sourceMessage('fixture.home')
                                : sourceMessage('fixture.away'),
                            )}
                            {localizeValue(
                              f.id === next?.id && (
                                <strong className={s.nextFixture}>
                                  {richMessage('copy.FixtureNotebook.d733d630dc')}
                                </strong>
                              ),
                            )}
                          </>
                        }
                        title={localizeValue(
                          opponent ? (
                            <ClubLink w={w} id={opponent.id} />
                          ) : (
                            sourceMessage('copy.FixtureNotebook.d9ba4cde0b')
                          ),
                        )}
                        actions={
                          result ? (
                            <>
                              <button
                                onClick={() => {
                                  setLoaded(undefined);
                                  setSelected({ id: f.id, year: f.year, view: 'report' });
                                }}
                              >
                                {richMessage('copy.FixtureNotebook.5624f76fe0')}
                              </button>
                              <button
                                onClick={() => {
                                  setLoaded(undefined);
                                  setSelected({ id: f.id, year: f.year, view: 'material' });
                                }}
                              >
                                {richMessage('copy.stories.a3b55318c6')}
                              </button>
                            </>
                          ) : undefined
                        }
                      >
                        {localizeValue(
                          result ? (
                            <>
                              <b>
                                {richMessage('copy.FixtureNotebook.70b778e4b4', {
                                  p0: result.result,
                                  p1: result.own,
                                  p2: result.other,
                                })}
                              </b>
                              <p className={s.fixtureNote}>
                                {richMessage('copy.FixtureNotebook.aa1e1acd84')}
                              </p>
                            </>
                          ) : (
                            <span className={s.fixtureNote}>
                              {richMessage('copy.FixtureNotebook.5dc1ae4f9a')}
                            </span>
                          ),
                        )}
                      </Card>
                    );
                  }),
                )}
              </div>
              {localizeValue(
                !fixtures.length && (
                  <p className={s.note}>{richMessage('copy.FixtureNotebook.b62613de29')}</p>
                ),
              )}
              {localizeValue(
                last > 0 && (
                  <div className={s.controls}>
                    <button disabled={current === 0} onClick={() => setPage(current - 1)}>
                      {richMessage('copy.FixtureNotebook.14feb3ae4f')}
                    </button>
                    <span className={s.note}>
                      {localizeValue(current + 1)}/{localizeValue(last + 1)}
                    </span>
                    <button disabled={current === last} onClick={() => setPage(current + 1)}>
                      {richMessage('copy.FixtureNotebook.93b4421405')}
                    </button>
                  </div>
                ),
              )}
            </section>
          ),
        )}
      </details>
      {localizeValue(
        selected && (
          <Dialog
            label={localizeValue(
              selected.view === 'material'
                ? sourceMessage('copy.FixtureNotebook.f5d5cf8aa7')
                : sourceMessage('copy.FixtureNotebook.1a6eb95ec2'),
            )}
            onClose={() => setSelected(undefined)}
            wide
          >
            {localizeValue(
              detail?.record && selected.view === 'material' ? (
                <Suspense
                  fallback={
                    <p className={s.note}>{richMessage('copy.FixtureNotebook.48fed68440')}</p>
                  }
                >
                  <MatchMaterial record={detail.record} w={w} />
                </Suspense>
              ) : detail?.record ? (
                <MatchReport record={detail.record} w={w} />
              ) : (
                <p className={s.note} role={detail?.error ? 'alert' : 'status'}>
                  {localizeValue(detail?.error || sourceMessage('copy.FixtureNotebook.0998cc7d18'))}
                </p>
              ),
            )}
          </Dialog>
        ),
      )}
    </>
  );
}
