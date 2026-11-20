import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { Select } from '../../../shared/ui/Select';
import { Suspense, useEffect, useState } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import type { GameClient } from '../../../runtime/client';
import { fixtureDate, nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import { ownSeasonFixtures } from '../../../entities/league';
import { missingMaterialMessageId } from '../../../entities/match';
import { competitionLabel, kindLabel } from '../../../presentation/format';
import { Dialog } from '../../../shared/ui/Dialog';
import { MatchMaterial, MatchReport } from '../../../features/match-viewer';
import { FixtureResultRow } from '../../../widgets/league-insights';
import l from '../../../shared/ui/styles/LeagueInsights.module.css';
import s from '../../../shared/ui/styles/Analysis.module.css';

export function FixtureNotebook({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
  const [scope, setScope] = useState('all'),
    [kind, setKind] = useState('all'),
    [venue, setVenue] = useState('all');
  const [selected, setSelected] = useState<{
    id: string;
    year: number;
    view: 'report' | 'material';
  }>();
  const [loaded, setLoaded] = useState<{ id: string; record?: MatchRecord; error?: string }>();
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
  const materialMatches = new Set(
    w.ownMatches.filter((match) => match.material).map((match) => match.id),
  );
  const fixtures = ownSeasonFixtures(w).filter(
    (f) =>
      (scope === 'all' || (scope === 'completed' ? !!f.score : !f.score)) &&
      (kind === 'all' || f.kind === kind) &&
      (venue === 'all' || (venue === 'home' ? f.home === w.playerClub : f.away === w.playerClub)),
  );
  const next = nextOwnFixture(w);
  const detail = loaded?.id === selected?.id ? loaded : undefined;
  return (
    <>
      <section
        data-surface="panel"
        data-component="fixture-notebook"
        className={l.panel}
        aria-label={displayMessage('copy.FixtureNotebook.dd5ad63c8d')}
      >
        <div className={l.fixtureFilters}>
          <label>
            {richMessage('copy.FixtureNotebook.e3dae42678', {
              p0: ' ',
              p1: (
                <Select
                  aria-label={displayMessage('copy.FixtureNotebook.f393e10539')}
                  value={scope}
                  onValueChange={setScope}
                >
                  <option value="upcoming">{richMessage('copy.FixtureNotebook.935c2e5e1a')}</option>
                  <option value="completed">
                    {richMessage('copy.FixtureNotebook.42d379b200')}
                  </option>
                  <option value="all">{richMessage('copy.FixtureNotebook.1474153e3a')}</option>
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
                  onValueChange={setKind}
                >
                  <option value="all">{richMessage('copy.FixtureNotebook.4be0674739')}</option>
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
                  onValueChange={setVenue}
                >
                  <option value="all">{richMessage('copy.FixtureNotebook.ca3fc2978f')}</option>
                  <option value="home">{richMessage('fixture.home')}</option>
                  <option value="away">{richMessage('fixture.away')}</option>
                </Select>
              ),
            })}
          </label>
        </div>
        <p className={l.fixtureCount}>
          {richMessage('copy.FixtureNotebook.89baa69a31', { p0: fixtures.length })}
        </p>
        <ul className={`${l.results} ${l.seasonResults}`}>
          {fixtures.map((fixture) => {
            const ownHome = fixture.home === w.playerClub;
            return (
              <FixtureResultRow
                key={fixture.id}
                w={w}
                fixture={fixture}
                next={fixture.id === next?.id}
                meta={
                  <>
                    {localizeValue(fixtureDate(w, fixture))}
                    {' · '}
                    {localizeValue(competitionLabel(w, fixture))}
                    {' · '}
                    {richMessage(ownHome ? 'fixture.home' : 'fixture.away')}
                    {fixture.id === next?.id && (
                      <strong className={s.nextFixture}>
                        {richMessage('copy.FixtureNotebook.d733d630dc')}
                      </strong>
                    )}
                  </>
                }
                actions={
                  fixture.score && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setLoaded(undefined);
                          setSelected({ id: fixture.id, year: fixture.year, view: 'report' });
                        }}
                      >
                        {richMessage('copy.FixtureNotebook.5624f76fe0')}
                      </button>
                      {materialMatches.has(fixture.id) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLoaded(undefined);
                            setSelected({ id: fixture.id, year: fixture.year, view: 'material' });
                          }}
                        >
                          {richMessage('copy.stories.a3b55318c6')}
                        </button>
                      ) : (
                        <span className={s.fixtureNote}>
                          {richMessage(missingMaterialMessageId(fixture.year, w.year))}
                        </span>
                      )}
                    </>
                  )
                }
              />
            );
          })}
        </ul>
        {!fixtures.length && (
          <p className={l.empty}>{richMessage('copy.FixtureNotebook.b62613de29')}</p>
        )}
      </section>
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
