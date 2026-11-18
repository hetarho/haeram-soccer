/**
 * The engine tunables the market-season harness's `--config` may override (scripts/market-seasons.ts):
 * the squad, youth, level, market, book and price constants, the NPC market's era caps and the
 * selling-club and personal-terms answers' values. A new market constant joins here. Overrides are
 * merged over the defaults in this process only; the engine source never changes.
 */
import { CLUB_BOOKS } from '../../packages/engine/src/owner-config';
import { CLUB_LEVELS } from '../../packages/engine/src/persisted-squads';
import { FREE_AGENT_CONFIG } from '../../packages/engine/src/free-agents';
import { MARKET_CONFIG } from '../../packages/engine/src/market-prices';
import { NPC_MARKET } from '../../packages/engine/src/npc-market';
import { NPC_YOUTH } from '../../packages/engine/src/npc-careers';
import { TERMS_VALUES } from '../../packages/engine/src/personal-terms';
import {
  NPC_MARKET_ERA,
  SALE_FACTOR_VALUES,
  SALE_SHARE,
} from '../../packages/engine/src/transfer-policy';
import { NPC_SQUAD, SQUAD_SPREAD_CONFIG } from '../../packages/engine/src/world';
import { applyTunables, plainClone } from './market-seasons';

export const MARKET_TUNABLES: Record<string, object> = {
  NPC_SQUAD,
  NPC_YOUTH,
  CLUB_LEVELS,
  NPC_MARKET,
  NPC_MARKET_ERA,
  SALE_SHARE,
  SALE_FACTOR_VALUES,
  TERMS_VALUES,
  SQUAD_SPREAD_CONFIG,
  CLUB_BOOKS,
  MARKET_CONFIG,
  FREE_AGENT_CONFIG,
};
const DEFAULTS = plainClone(MARKET_TUNABLES);

/**
 * The defaults with `config` over them, every earlier override undone first; returns each named
 * tunable's values now in force, for the output to echo.
 */
export function setTunables(config: Record<string, unknown>): Record<string, unknown> {
  applyTunables(MARKET_TUNABLES, plainClone(DEFAULTS));
  applyTunables(MARKET_TUNABLES, plainClone(config));
  return Object.fromEntries(
    Object.keys(config).map((name) => [name, plainClone(MARKET_TUNABLES[name])]),
  );
}
