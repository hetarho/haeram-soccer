/**
 * UI imports of engine orchestration (→ARCH-4). The UI names engine values only from read leaves:
 * modules whose runtime closure reaches none of `ORCHESTRATION`. Today's other imports are listed
 * below; entries are only ever removed, in the commit that moves the read into a leaf.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { dependencies, runtimeImports, sourceGraph } from './source-graph';

export const ORCHESTRATION = [
  'packages/engine/src/world.ts',
  'packages/engine/src/season.ts',
  'packages/engine/src/match.ts',
  'packages/engine/src/grid/engine.ts',
];
export const UI_DIRECTORIES = ['apps/web/src/ui', 'apps/web/src/presentation'];

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
  for (const directory of UI_DIRECTORIES)
    for (const name of readdirSync(resolve(graph.root, directory)).sort()) {
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
  return out;
}

export const UI_ORCHESTRATION_IMPORTS: Record<string, string[]> = {
  'apps/web/src/ui/AcademyPanel.tsx': ['packages/engine/src/academy.ts'],
  'apps/web/src/ui/App.tsx': ['packages/engine/src/ops-staff.ts'],
  'apps/web/src/ui/AwaySummary.tsx': ['packages/engine/src/projection.ts'],
  'apps/web/src/ui/Bracket.tsx': ['packages/engine/src/knockout.ts'],
  'apps/web/src/ui/BusinessWorkbench.tsx': [
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/ops-commercial.ts',
    'packages/engine/src/sponsors.ts',
  ],
  'apps/web/src/ui/CashAlarm.tsx': [
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/settlement.ts',
  ],
  'apps/web/src/ui/ClubStaff.tsx': [
    'packages/engine/src/hiring.ts',
    'packages/engine/src/managerMarket.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/ui/CupHistory.tsx': ['packages/engine/src/cups.ts'],
  'apps/web/src/ui/CupsView.tsx': [
    'packages/engine/src/cups.ts',
    'packages/engine/src/europe.ts',
    'packages/engine/src/knockout.ts',
    'packages/engine/src/season.ts',
  ],
  'apps/web/src/ui/EventCenter.tsx': [
    'packages/engine/src/contracts.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/stopping.ts',
  ],
  'apps/web/src/ui/FacilityParts.tsx': [
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
  ],
  'apps/web/src/ui/FinanceOutlook.tsx': ['packages/engine/src/projection.ts'],
  'apps/web/src/ui/FinancialBreakdown.tsx': ['packages/engine/src/finance.ts'],
  'apps/web/src/ui/LiveSeason.tsx': [
    'packages/engine/src/strategy.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/ui/MediationReview.tsx': ['packages/engine/src/signings.ts'],
  'apps/web/src/ui/OvrBadge.tsx': ['packages/engine/src/world.ts'],
  'apps/web/src/ui/PersonCareer.tsx': ['packages/engine/src/staff.ts'],
  'apps/web/src/ui/Pitch.tsx': [
    'packages/engine/src/managerMarket.ts',
    'packages/engine/src/match.ts',
  ],
  'apps/web/src/ui/PlayerProfile.tsx': [
    'packages/engine/src/career-assessment.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/ui/PlayerSheetDialog.tsx': [
    'packages/engine/src/contracts.ts',
    'packages/engine/src/discipline.ts',
  ],
  'apps/web/src/ui/PlayingCoachReview.tsx': ['packages/engine/src/staff.ts'],
  'apps/web/src/ui/PolicyBoard.tsx': [
    'packages/engine/src/academy.ts',
    'packages/engine/src/bases.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/policy.ts',
    'packages/engine/src/projection.ts',
  ],
  'apps/web/src/ui/ProgressControls.tsx': ['packages/engine/src/stopping.ts'],
  'apps/web/src/ui/RecruitmentDesk.tsx': [
    'packages/engine/src/recruitment.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/ui/Rich.tsx': [
    'packages/engine/src/contracts.ts',
    'packages/engine/src/discipline.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/managerMarket.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/ui/ScoutShortlist.tsx': [
    'packages/engine/src/signings.ts',
    'packages/engine/src/staff.ts',
  ],
  'apps/web/src/ui/StrategyBoard.tsx': [
    'packages/engine/src/academy.ts',
    'packages/engine/src/care.ts',
    'packages/engine/src/policy.ts',
    'packages/engine/src/presets.ts',
    'packages/engine/src/synergy.ts',
    'packages/engine/src/transfers.ts',
  ],
  'apps/web/src/ui/StrategyComposer.tsx': [
    'packages/engine/src/presets.ts',
    'packages/engine/src/synergy.ts',
  ],
  'apps/web/src/ui/StrategyPanel.tsx': [
    'packages/engine/src/discipline.ts',
    'packages/engine/src/grid/setup.ts',
    'packages/engine/src/ops-staff.ts',
    'packages/engine/src/strategy.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/ui/TeamSheetDialog.tsx': ['packages/engine/src/ratings.ts'],
  'apps/web/src/ui/TrainingOrderSheet.tsx': [
    'packages/engine/src/academy.ts',
    'packages/engine/src/coach-training.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/training.ts',
  ],
  'apps/web/src/ui/TrainingView.tsx': [
    'packages/engine/src/careers.ts',
    'packages/engine/src/coach-training.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/staff.ts',
    'packages/engine/src/training.ts',
  ],
  'apps/web/src/ui/board.ts': [
    'packages/engine/src/bases.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/policy.ts',
    'packages/engine/src/presets.ts',
    'packages/engine/src/projection.ts',
  ],
  'apps/web/src/ui/bracketTree.ts': [
    'packages/engine/src/cups.ts',
    'packages/engine/src/europe.ts',
    'packages/engine/src/knockout.ts',
  ],
  'apps/web/src/ui/cupCompetitions.ts': ['packages/engine/src/europe.ts'],
  'apps/web/src/ui/cupRoute.ts': ['packages/engine/src/stages.ts'],
  'apps/web/src/ui/discipline.ts': ['packages/engine/src/world.ts'],
  'apps/web/src/ui/league.ts': ['packages/engine/src/season.ts'],
  'apps/web/src/ui/officeChanges.ts': ['packages/engine/src/pending-work-preview.ts'],
  'apps/web/src/ui/officeSummary.ts': ['packages/engine/src/presets.ts'],
  'apps/web/src/ui/outcome.ts': [
    'packages/engine/src/strategy.ts',
    'packages/engine/src/training.ts',
    'packages/engine/src/world.ts',
  ],
  'apps/web/src/ui/recordTrends.ts': ['packages/engine/src/ratings.ts'],
  'apps/web/src/ui/scouting.ts': ['packages/engine/src/career-assessment.ts'],
  'apps/web/src/ui/strategies.ts': ['packages/engine/src/presets.ts'],
  'apps/web/src/ui/tacticComparison.ts': ['packages/engine/src/strategy.ts'],
  'apps/web/src/ui/teamState.ts': [
    'packages/engine/src/academy.ts',
    'packages/engine/src/care.ts',
    'packages/engine/src/coach-training.ts',
    'packages/engine/src/finance.ts',
    'packages/engine/src/investment.ts',
    'packages/engine/src/morale.ts',
    'packages/engine/src/policy.ts',
    'packages/engine/src/strategy.ts',
    'packages/engine/src/training.ts',
    'packages/engine/src/world.ts',
  ],
};
