/** One real 22-player NPC squad and two synthetic clubs, with no fixtures or progression. */
import { worldMarketFixture } from './world-market.testkit';
import { foundSquads } from './persisted-squads';
import { clubPlayers } from './world';

export function npcBooksFixture(year = 1950) {
  const w = worldMarketFixture();
  w.year = year;
  w.clubs[2]!.representative = true;
  foundSquads(w);
  const c = w.clubs[1]!;
  const players = clubPlayers(w, c);
  for (const p of players) {
    p.born = year - 24;
    p.until = year + 3;
  }
  return { w, c, players };
}
