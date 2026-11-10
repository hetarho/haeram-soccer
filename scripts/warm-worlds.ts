/**
 * Builds the worlds release-gate cases only read, beside the vitest phase (`scripts/verify.mjs`),
 * so a cold build does not run inside a case's timer. Each call is the case's own cached builder,
 * so the warm-up and the case resolve the same `cachedWorld` file; whichever starts first builds
 * it and the other waits on its lock. Without the warm-up the case builds the world itself.
 */
import { tenRichSeasons } from '../apps/web/src/adapters/persistence.testkit';

tenRichSeasons();
