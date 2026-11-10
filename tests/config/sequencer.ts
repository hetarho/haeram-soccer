import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';
import { COLD_COSTS } from './cold-costs.ts';

/**
 * Longest-first file order, also in a fresh worktree without vitest's duration history. A file's
 * cost is the larger of its recorded duration and its committed cold cost (`cold-costs.ts`); files
 * with a cost start first, costliest first, and the rest follow in vitest's own order. Ties keep
 * vitest's order, and sharding is vitest's own, so every shard keeps its files.
 */
export class LongestFirstSequencer extends BaseSequencer {
  private readonly coldCosts: Readonly<Record<string, number>>;

  constructor(ctx: Vitest, coldCosts: Readonly<Record<string, number>> = COLD_COSTS) {
    super(ctx);
    this.coldCosts = coldCosts;
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = (await super.sort(files)).map((spec, index) => ({
      spec,
      index,
      seconds: this.seconds(spec),
    }));
    const costed = ordered.filter((file) => file.seconds !== undefined);
    costed.sort((a, b) => b.seconds! - a.seconds! || a.index - b.index);
    return [...costed, ...ordered.filter((file) => file.seconds === undefined)].map(
      ({ spec }) => spec,
    );
  }

  /** Expected seconds, or undefined when vitest recorded no duration and the table has no entry. */
  private seconds(spec: TestSpecification): number | undefined {
    const file = relative(this.ctx.config.root, spec.moduleId);
    const recorded = this.ctx.cache.getFileTestResults(`${spec.project.name}:${file}`)?.duration;
    const cold: number | undefined = this.coldCosts[file];
    if (recorded === undefined && cold === undefined) return undefined;
    return Math.max((recorded ?? 0) / 1000, cold ?? 0);
  }
}
