/**
 * UI imports of engine orchestration (→ARCH-4). The UI names engine values only from read leaves:
 * modules whose runtime closure reaches none of `ORCHESTRATION`. Today's other imports are listed
 * below; entries are only ever removed, in the commit that moves the read into a leaf.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { dependencies, runtimeImports, sourceGraph } from './source-graph';

export const ORCHESTRATION = [
  'packages/engine/src/world.ts',
  'packages/engine/src/season.ts',
  'packages/engine/src/match.ts',
  'packages/engine/src/grid/engine.ts',
];
/** The feature-sliced web layers, highest first (→ARCH-3/4). */
export const UI_LAYERS = [
  'apps/web/src/app',
  'apps/web/src/pages',
  'apps/web/src/widgets',
  'apps/web/src/features',
  'apps/web/src/entities',
  'apps/web/src/shared',
];
/** Presentation and the feature-sliced layers (→ARCH-3). */
export const UI_DIRECTORIES = ['apps/web/src/presentation', ...UI_LAYERS];

/** Each UI source file mapped to the engine modules it imports whose closure reaches orchestration. */
export function uiOrchestrationImports(root: string): Record<string, string[]> {
  const graph = sourceGraph(root),
    reaches = new Map<string, boolean>(),
    out: Record<string, string[]> = {};
  const orchestrated = (module: string) => {
    let hit = reaches.get(module);
    if (hit === undefined) {
      const files = dependencies(graph, [module]).map((file) => relative(graph.root, file));
      hit = ORCHESTRATION.some((name) => files.includes(name));
      reaches.set(module, hit);
    }
    return hit;
  };
  for (const directory of UI_DIRECTORIES) {
    if (!existsSync(resolve(graph.root, directory))) continue;
    const names = readdirSync(resolve(graph.root, directory), {
      recursive: true,
      encoding: 'utf8',
    });
    for (const name of names.sort()) {
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$|testkit/.test(name)) continue;
      const file = join(directory, name);
      const modules = runtimeImports(readFileSync(resolve(graph.root, file), 'utf8'), file)
        .filter((spec) => spec.startsWith('.'))
        .map((spec) => relative(graph.root, resolve(graph.root, dirname(file), spec)))
        .map((path) => (/\.[cm]?[jt]sx?$|\.json$/.test(path) ? path : `${path}.ts`))
        .filter((module) => module.startsWith('packages/engine/') && orchestrated(module))
        .sort();
      if (modules.length) out[file] = [...new Set(modules)];
    }
  }
  return out;
}

export const UI_ORCHESTRATION_IMPORTS: Record<string, string[]> = {
  'apps/web/src/pages/club/ui/AcademyPanel.tsx': ['packages/engine/src/academy.ts'],
  'apps/web/src/widgets/away-summary/ui/AwaySummary.tsx': ['packages/engine/src/projection.ts'],
  'apps/web/src/pages/club/ui/BusinessWorkbench.tsx': [
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/ops-commercial.ts',
    'packages/engine/src/sponsors.ts',
  ],
  'apps/web/src/widgets/cash-alarm/ui/CashAlarm.tsx': [
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/settlement.ts',
  ],
  'apps/web/src/pages/club/ui/ClubStaff.tsx': [
    'packages/engine/src/hiring.ts',
    'packages/engine/src/managerMarket.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/pages/cups/ui/CupsView.tsx': [
    'packages/engine/src/europe.ts',
    'packages/engine/src/knockout.ts',
  ],
  'apps/web/src/pages/club/ui/FacilityParts.tsx': ['packages/engine/src/finance.ts'],
  'apps/web/src/app/office/FinanceOutlook.tsx': ['packages/engine/src/projection.ts'],
  'apps/web/src/pages/club/ui/FinancialBreakdown.tsx': ['packages/engine/src/finance.ts'],
  'apps/web/src/pages/journal/ui/LiveSeason.tsx': [
    'packages/engine/src/strategy.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/entities/player/ui/OvrBadge.tsx': ['packages/engine/src/world.ts'],
  'apps/web/src/features/match-viewer/ui/Pitch.tsx': ['packages/engine/src/managerMarket.ts'],
  'apps/web/src/entities/player/ui/PlayerProfile.tsx': [
    'packages/engine/src/career-assessment.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/pages/club/ui/RecruitmentDesk.tsx': [
    'packages/engine/src/recruitment.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/pages/club/ui/Rich.tsx': [
    'packages/engine/src/contracts.ts',
    'packages/engine/src/discipline.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/managerMarket.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/pages/club/ui/ScoutShortlist.tsx': ['packages/engine/src/signings.ts'],
  'apps/web/src/features/match-prep/ui/StrategyPanel.tsx': [
    'packages/engine/src/discipline.ts',
    'packages/engine/src/strategy.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/pages/club/ui/TrainingView.tsx': [
    'packages/engine/src/careers.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/training.ts',
  ],
  'apps/web/src/entities/player/lib/discipline.ts': ['packages/engine/src/world.ts'],
  'apps/web/src/entities/office/lib/officeChanges.ts': [
    'packages/engine/src/pending-work-preview.ts',
  ],
  'apps/web/src/app/model/outcome.ts': ['packages/engine/src/training.ts'],
  'apps/web/src/entities/league/lib/scouting.ts': ['packages/engine/src/career-assessment.ts'],
  'apps/web/src/entities/player/lib/teamState.ts': [
    'packages/engine/src/academy.ts',
    'packages/engine/src/coach-training.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/strategy.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/widgets/player-detail/ui/OwnPlayerSheet.tsx': [
    'packages/engine/src/contracts.ts',
    'packages/engine/src/discipline.ts',
  ],
};
