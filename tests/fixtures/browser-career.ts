/** Release one actual persisted external player, retaining the ordinary identity/history path. */
export async function releasedMarketPlayer(w: import('../../packages/contracts/src/types').World) {
  const { joinFreeAgents } = await import('../../packages/engine/src/free-agents');
  const { retainPerson, openEmployment } = await import('../../packages/engine/src/person-careers');
  const { worldMarketOffer } = await import('../../packages/engine/src/world-market');
  const { recruitmentPreview } = await import('../../packages/engine/src/recruitment');
  const { transferOffers } = await import('../../packages/engine/src/scout-search');
  const ownCountry = w.clubs.find((c) => c.id === w.playerClub)!.country;
  // The same scout list required after release already identifies eligible sporting candidates.
  // Trial its actual available club players rather than cloning the world for every domestic row.
  const candidates = transferOffers(w)
    .flatMap((offer) => {
      if (!offer.available || offer.freeAgent || offer.source.kind !== 'club') return [];
      const club = offer.source.club;
      if (!w.clubs.some((c) => c.id === club && !c.representative && c.country === ownCountry))
        return [];
      const player = w.squads?.[club]?.find((p) => p.id === offer.player.id);
      return player ? [{ club, player }] : [];
    })
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
  const { saveFileOf } = await import('./save-file');
  const { openSaveMenu } = await import('../e2e/save-menu');
  const { openClubhouse } = await import('../e2e/competition-navigation');
  const { expect } = await import('@playwright/test');
  const menu = await openSaveMenu(page);
  await menu
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'prepared-career.haeram-save',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(await saveFileOf(w)),
    });
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '기록 교체하고 가져오기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '기록 가져오기 확인' })).toHaveCount(0);
  // The confirmation stays open until the worker has adopted the imported world.
  await openClubhouse(page);
  await expect(page.getByTestId('club-hub')).toHaveAttribute('data-home-active', 'true');
}
