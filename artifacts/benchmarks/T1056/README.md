# T1056 lived sellout reads (ECON-9, ECON-29)

- command: `node_modules/.bin/tsx scripts/calibrate-economy.ts --career-sellout --out artifacts/benchmarks/T1056/career-sellout.json`
  (stdout `career-sellout.md`, per-read wall time `career-sellout.log`)
- source: base b05100f5b2e7 plus T1056's `--career-sellout` mode (engine unchanged), Node 24.22.1,
  host hq-dev1-pve2-vm2, 2026-11-24; no world cache, each read builds its checkpoint afresh.
- cases: `careerWorld` seed `economy-<code>-0`, 1950 takeover; FRA/ENG 중견 사업가 reference club
  (the lowest professional division's first club) and FRA/ENG 석유 재벌 takeover of `<code>:0:0:0`;
  one year of fixed costs in cash, every responsibility delegated, ECON-29's facility rule, no owner
  money; ticket 0.05 and 0.12 from the same checkpoint until 50 owned matches settled.
- definitions: 1901 price units per season; turnover = competition + matchday + commercial income,
  without player sales and owner money; club expense excludes the owner's own takeover, living and
  business entries; operating = turnover − (club expense − purchases), construction included;
  "before construction" adds facility spend back. Wages = the `operating-cost` ledger line.
