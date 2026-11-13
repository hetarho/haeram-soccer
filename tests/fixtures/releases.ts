/** Explicit release values without importing a world builder or cache. */
import {
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/match-model-release';
export { MATCH_MODEL_RELEASE };

/**
 * The released model, as a copy a test passes explicitly so a world it builds names its release
 * (→SAVE-23); there is no switch to turn off and no earlier model to play.
 */
export const ENABLED_RELEASE: MatchModelRelease = { ...MATCH_MODEL_RELEASE };

/** Release one actual persisted external player, retaining the ordinary identity/history path. */
export async function releasedMarketPlayer(w: import('../../packages/contracts/src/types').World) {
  const { joinFreeAgents } = await import('../../packages/engine/src/free-agents');
  const { retainPerson, openEmployment } = await import('../../packages/engine/src/person-careers');
  const { worldMarketOffer } = await import('../../packages/engine/src/world-market');
  const { recruitmentPreview } = await import('../../packages/engine/src/recruitment');
  const { scoutReach, transferOffers } = await import('../../packages/engine/src/scout-search');
  const { overall } = await import('../../packages/engine/src/player-state');
  const reach = scoutReach(w);
  const ownCountry = w.clubs.find((c) => c.id === w.playerClub)!.country;
  const candidates = Object.entries(w.squads ?? {})
    .filter(
      ([club]) =>
        club !== w.playerClub &&
        w.clubs.some((c) => c.id === club && !c.representative && c.country === ownCountry),
    )
    .flatMap(([club, players]) =>
      players
        .filter(
          (p) =>
            p.status === 'active' &&
            !p.loanUntil &&
            p.retiring === undefined &&
            w.year - p.born >= reach.age[0] &&
            w.year - p.born <= reach.age[1] &&
            overall(p) >= reach.ability[0] &&
            overall(p) <= reach.ability[1],
        )
        .map((player) => ({ club, player })),
    )
    .sort((a, b) =>
      BigInt(a.player.wage) < BigInt(b.player.wage)
        ? -1
        : BigInt(a.player.wage) > BigInt(b.player.wage)
          ? 1
          : a.player.id.localeCompare(b.player.id),
    );
  for (const { club, player } of candidates) {
    const trial = structuredClone(w);
    const actual = trial.squads![club]!.find((p) => p.id === player.id)!;
    retainPerson(trial, actual, club);
    openEmployment(trial, actual.id, 'player', club);
    if (!joinFreeAgents(trial, actual, trial.year)) continue;
    const reference = { world: trial.id, kind: 'offer' as const, playerId: actual.id };
    const offer = worldMarketOffer(trial, reference);
    if (!offer?.available || !offer.freeAgent) continue;
    const preview = recruitmentPreview(trial, offer);
    if (
      !preview.eligible ||
      !preview.affordable ||
      !transferOffers(trial).some((o) => o.player.id === actual.id && o.available && o.freeAgent)
    )
      continue;
    retainPerson(w, player, club);
    openEmployment(w, player.id, 'player', club);
    if (!joinFreeAgents(w, player, w.year)) return undefined;
    return worldMarketOffer(w, { ...reference, world: w.id });
  }
  return undefined;
}

/** Import a prepared copy of the actual running career through the public save controls. */
export async function importPreparedCareer(
  page: import('@playwright/test').Page,
  w: import('../../packages/contracts/src/types').World,
) {
  const { encode } = await import('../../apps/web/src/adapters/persistence');
  const { openSaveMenu } = await import('../e2e/save-menu');
  const { expect } = await import('@playwright/test');
  const menu = await openSaveMenu(page);
  await menu
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'prepared-career.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(w)),
    });
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '기록 교체하고 가져오기', exact: true }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible();
}
