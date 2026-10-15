import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { selectStrategyWorld } from './liveState';
import { usePlayerPreparation } from './state';
import { StrategyPanel } from './StrategyPanel';

export function PlayerPreparationHost({ client }: { client: GameClient }) {
  const id = usePlayerPreparation((state) => state.id);
  const requestedWorld = usePlayerPreparation((state) => state.world);
  const world = useGameState(selectStrategyWorld);
  const player = world?.players.find((player) => player.id === id && player.status === 'active');
  if (!world || requestedWorld !== world.id || !player) return null;
  return (
    <StrategyPanel
      w={world}
      client={client}
      playerId={player.id}
      onClose={usePlayerPreparation.getState().close}
    />
  );
}
