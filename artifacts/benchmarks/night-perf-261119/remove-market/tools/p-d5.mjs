// D5: the view's manager candidates, staff market, transfer offers, discipline names and office read
// are recomputed once a calendar week instead of every day.
const H = 'apps/web/src/runtime/host.ts';
export default [
  { file: H, from: "  private projection(w: World): View {\n",
    to: "  private projection(w: World): View {\n    const wk = `${w.year}:${Math.floor(((w as any).calendar?.day ?? 0) / 7)}`;\n    const cache: Map<string, { k: string; v: unknown }> = ((this as any).__weekly ??= new Map());\n    const weekly = <T,>(name: string, f: () => T): T => {\n      const hit = cache.get(name);\n      if (hit && hit.k === wk) return hit.v as T;\n      const v = f();\n      cache.set(name, { k: wk, v });\n      return v;\n    };\n" },
  { file: H, from: "      coaches: staffMarket(w),", to: "      coaches: weekly('coaches', () => staffMarket(w))," },
  { file: H, from: "        disciplineNames: disciplineNames(w),", to: "        disciplineNames: weekly('discipline', () => disciplineNames(w))," },
  { file: H, from: "      managers: managerCandidates(w),", to: "      managers: weekly('managers', () => managerCandidates(w))," },
  { file: H, from: "      transfers: transferOffers(w),", to: "      transfers: weekly('transfers', () => transferOffers(w))," },
  { file: H, from: "      office: officeRead(w),", to: "      office: weekly('office', () => officeRead(w))," },
];
