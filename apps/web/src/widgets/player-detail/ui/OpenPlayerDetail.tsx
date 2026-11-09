import { useTextLocale } from '../../../presentation/text';
import { usePlayerDetail } from '../../../entities/player';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { useRead } from '../../../shared/lib';
import { worldSelector } from '../../../shared/lib/liveState';
import { OtherPlayerSheet } from './OtherPlayerSheet';
import { OwnPlayerSheet } from './OwnPlayerSheet';

const selectPlayerWorld = worldSelector([
  'id',
  'players',
  'clubs',
  'calendar',
  'ownMatches',
  'year',
  'playerClub',
  'tactic',
  'manager',
  'staff',
  'history',
  'discipline',
  'fixtures',
]);

/**
 * The player asked for over the world in play (loaded when a detail first opens): one of ours,
 * past or present, from the view; anyone else read from the worker by the club he was named with.
 */
export function OpenPlayerDetail({ id, client }: { id: string; client: GameClient }) {
  useTextLocale();
  const w = useGameState(selectPlayerWorld);
  const scope = usePlayerDetail((state) => state.scope);
  const club = usePlayerDetail((state) => state.club);
  const close = usePlayerDetail((state) => state.close);
  const tallies = useGameState((state) => state.view?.tallies.players);
  const tally = tallies?.[id];
  const own = w?.players.find((p) => p.id === id);
  const read = useRead(w && !own ? `${w.id}:${w.year}:${id}` : undefined, () =>
    client.playerProfile(id, club),
  );
  if (!w) return null;
  if (own)
    return (
      <OwnPlayerSheet
        key={id}
        w={w}
        player={own}
        scope={scope}
        onClose={close}
        client={client}
        tally={tally}
        tallies={tallies}
      />
    );
  return <OtherPlayerSheet key={id} w={w} id={id} read={read} client={client} onClose={close} />;
}
