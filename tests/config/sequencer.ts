import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';
import { COLD_COSTS, WARMED } from './cold-costs.ts';

/**
 * Longest-first file order, also in a fresh worktree without vitest's duration history. A file's
 * cost is the larger of its recorded duration and its committed cold cost (`cold-costs.ts`); files
 * with a cost start first, costliest first, and the rest follow in vitest's own order. Files whose
 * worlds the gate warms (`WARMED`) come last whatever their history, so a duration recorded while
 * one built its world cold never starts it beside the warm-up. Ties keep vitest's order, and
 * sharding is vitest's own, so every shard keeps its files.
 */
export class LongestFirstSequencer extends BaseSequencer {
  private readonly coldCosts: Readonly<Record<string, number>>;
  private readonly warmed: ReadonlySet<string>;

  constructor(
    ctx: Vitest,
    coldCosts: Readonly<Record<string, number>> = COLD_COSTS,
    warmed: readonly string[] = WARMED,
  ) {
    super(ctx);
    this.coldCosts = coldCosts;
    this.warmed = new Set(warmed);
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = (await super.sort(files)).map((spec, index) => {
      const file = relative(this.ctx.config.root, spec.moduleId);
      const warmed = this.warmed.has(file);
      return { spec, index, warmed, seconds: warmed ? undefined : this.seconds(spec, file) };
    });
    const costed = ordered.filter((file) => file.seconds !== undefined);
    costed.sort((a, b) => b.seconds! - a.seconds! || a.index - b.index);
    const rest = ordered.filter((file) => file.seconds === undefined);
    return [
      ...costed,
      ...rest.filter((file) => !file.warmed),
      ...rest.filter((file) => file.warmed),
    ].map(({ spec }) => spec);
  }

  /** Expected seconds, or undefined when vitest recorded no duration and the table has no entry. */
  private seconds(spec: TestSpecification, file: string): number | undefined {
    const recorded = this.ctx.cache.getFileTestResults(`${spec.project.name}:${file}`)?.duration;
    const cold: number | undefined = this.coldCosts[file];
    if (recorded === undefined && cold === undefined) return undefined;
    return Math.max((recorded ?? 0) / 1000, cold ?? 0);
  }
}
