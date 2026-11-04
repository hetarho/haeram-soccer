// T689 cv04: tabulates concentration JSONs and band-check logs.
//   node summary.mjs ART_DIR LOG_DIR name[:part] ...
// A name's concentration comes from conc-<name>-<part>.json (part calibration by default; nx04's
// control file for `ctl`), its band rows from <LOG_DIR>/bands-<name>-<N>.log when present.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const [art, logs, ...names] = process.argv.slice(2);
const pct = (x) => (100 * x).toFixed(1);
const ci = (o) => `${pct(o.mean)} [${pct(o.ci[0])}, ${pct(o.ci[1])}]`;
const KEYS = [
  'shots (team)',
  'xG per shot',
  'on target %',
  'shots from goal area %',
  'shots from rest of box %',
  'shots from outside %',
  'possessions ending in a shot %',
  'pass back %',
  'goals (match)',
  'penalty goals %',
  'set-piece goals (no pens) %',
  'goals by FW %',
  'goals by MF %',
  'goals by DF %',
  'corners (team)',
  'goal kicks (team)',
];
for (const spec0 of names) {
  // `name@N` reads bands-<name>-<N>.log (default: the first bands-<name>-*.log).
  const [spec, size] = spec0.split('@');
  const [name, part = 'calibration'] = spec.split(':');
  let file = `${art}/conc-${name}-${part}.json`;
  if (!existsSync(file) && name === 'ctl')
    file = `${art}/../scoring-261104-nx04/conc-arrHoldEZ60-${part}.json`;
  console.log(`\n== ${name} (${part})`);
  if (existsSync(file)) {
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const st = c.positions.find((p) => p.pos === 'ST');
    const cm = c.positions.find((p) => p.pos === 'CM');
    const fw = c.positions
      .filter((p) => ['ST', 'LW', 'RW'].includes(p.pos))
      .reduce((a, p) => a + p.goalShare, 0);
    console.log(
      `conc ${c.matches}: goals ${c.goalsPerMatch} shots ${c.shotsPerTeam} hat ${c.hatTricksPerMatch} clubs20 ${c.clubsWith20Goals}` +
        ` top ${ci(c.topGoalShare)} topShot ${pct(c.topShotShare.mean)} conv ${pct(c.topConversion.mean)}/${pct(c.restConversion.mean)}` +
        ` ST ${st?.shotsPerApp} ${pct(st?.shotShare ?? 0)} ${pct(st?.goalShare ?? 0)} FWline ${pct(fw)} CM ${cm?.shotsPerApp} ${pct(cm?.goalShare ?? 0)} top38 ${c.topGoalsPer38.mean.toFixed(1)}`,
    );
  } else console.log('conc: none');
  const log = existsSync(logs)
    ? readdirSync(logs).find((f) =>
        size
          ? f === `bands-${name}-${size}.log` || f === `bands-${name}-${size}.txt`
          : f.startsWith(`bands-${name}-`) && /\.(log|txt)$/.test(f),
      )
    : undefined;
  if (!log) continue;
  const text = readFileSync(`${logs}/${log}`, 'utf8');
  const rows = [];
  for (const k of KEYS) {
    const line = text.split('\n').find((l) => l.startsWith(k));
    if (line) {
      const parts = line.slice(32).trim().split(/\s+/);
      rows.push(`${k.replace(/ \(.*\)| %/g, '')} ${parts[1]}${parts[2] === 'FAIL' ? '✗' : ''}`);
    }
  }
  const passed = text.match(/passed (\d+\/\d+)/)?.[1];
  const un = text.match(/unopposed chances ([0-9.]+) a team \(([0-9.]+)% of shots\), scored ([0-9.]+)%/);
  console.log(`bands ${log}: passed ${passed}; unopposed ${un?.[1]} (${un?.[2]}%, scored ${un?.[3]}%)`);
  console.log('  ' + rows.join(' | '));
}
