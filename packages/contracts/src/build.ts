/**
 * The club build (→ECON-22): six slots, each holding one card. A slot left out is the standard
 * card, so a club that never chose keeps neutral effects and a small save.
 */
export const BUILD_OPTIONS = {
  youth: ['homegrown', 'partnership', 'worldwide', 'elite'],
  scouting: ['data', 'proven', 'network', 'local'],
  market: ['selling', 'showcase', 'hold', 'hardball'],
  revenue: ['commercial', 'owner', 'frugal', 'members'],
  fans: ['community', 'fortress', 'mutual', 'families'],
  culture: ['family', 'meritocracy', 'stars', 'veterans'],
} as const;
export type BuildSlot = keyof typeof BUILD_OPTIONS;
export const BUILD_SLOTS = Object.keys(BUILD_OPTIONS) as BuildSlot[];
export type ClubBuild = { -readonly [S in BuildSlot]?: (typeof BUILD_OPTIONS)[S][number] };

/** Saved strategy names are the owner's own words, kept short for news and history lines. */
export const STRATEGY_NAME_LIMIT = 20;

/** The six club visions of rules 1.6–1.7 and the cards each loads as (→ECON-22). */
export const LEGACY_VISION_BUILDS: Record<string, ClubBuild> = {
  balanced: {},
  academy: { youth: 'homegrown', scouting: 'local', culture: 'meritocracy' },
  trading: { market: 'selling', scouting: 'data' },
  commercial: { revenue: 'commercial' },
  community: { fans: 'community', revenue: 'members', scouting: 'local' },
  ambition: { revenue: 'owner', scouting: 'proven', culture: 'stars' },
};
