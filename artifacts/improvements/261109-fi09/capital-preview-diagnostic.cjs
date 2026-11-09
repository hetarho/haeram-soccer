const fs = require('fs');
const cp = require('child_process');
const vm = require('vm');
const ts = require('/Users/ihaelam/project/haeram-soccer/node_modules/typescript');
const base = '6766ceab33c409cae3cddbe403d767e6eb2c36a6';
const get = (path) => cp.execFileSync('git', ['-C', '/Users/ihaelam/project/haeram-soccer', 'show', base + ':' + path], { encoding: 'utf8' });
const fn = (source, name) => ts.createSourceFile('fixed.ts', source, ts.ScriptTarget.Latest, true).statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name).getText() + '\n';
function load(source, globals = {}) {
  const box = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box);
  return box.exports;
}
const config = load(get('packages/engine/src/owner-config.ts'), { require: (path) => path.includes('owner') ? { DIVIDEND_SHARES: [0, 25, 50, 75, 100] } : { message: (id) => id } }).FAN_MOOD;
const format = load(get('apps/web/src/presentation/format.ts'), { require: () => ({}) });
const locale = load(fn(get('apps/web/src/presentation/locale.ts'), 'createLocaleFormatters'));
const uiSource = get('apps/web/src/entities/office/lib/ownerFigures.ts');
const statements = ts.createSourceFile('fixed.ts', uiSource, ts.ScriptTarget.Latest, true).statements;
const moodDeclaration = statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.name.getText() === 'moodChange')).getText();
const moodChange = load(moodDeclaration, { signed: format.signed }).moodChange;
const common = { FAN_MOOD: config, lastSeasonTurnover: (w) => w.last, seasonTurnover: (w) => BigInt(w.income), sourceMessage: (id, params) => ({ id, params }), careerEnded: () => false, hasTrait: (w, t) => w.owner.traits.includes(t), has: (o, t) => o.traits.includes(t), addEvent: (w, kind, title, detail) => w.probeEvents.push({ kind, detail }) };
const engineSource = get('packages/engine/src/fan-mood.ts');
const engine = load(['live', 'move', 'percentOf', 'fanMoodInjection', 'takeoverIncome', 'fanMoodDividend'].map((n) => fn(engineSource, n)).join('\n'), { ...common, clamp: (v, min, max) => Math.min(max, Math.max(min, v)) });
const ratio = load(fn(get('packages/engine/src/primitives.ts'), 'ratio')).ratio;
const preview = load(fn(uiSource, 'felt') + uiSource.match(/^const positive = .*$/m)[0] + '\n' + uiSource.match(/^const share = .*$/m)[0] + '\n' + fn(uiSource, 'injectionMood') + fn(uiSource, 'dividendOutlook'), { ...common, ratio, seasonResult: (w) => String(BigInt(w.income) - BigInt(w.expense)) });
function formats(change) {
  return Object.fromEntries(['ko-KR', 'de-DE', 'ar-SA'].map((id) => { format.setLocaleFormatters(locale.createLocaleFormatters(id)); return [id, moodChange(change)]; }));
}
const examples = [];
for (const [fanMood, traits] of [[60, []], [60, ['fansFriend']], [1, []]]) {
  const w = { year: 1970, income: '3330000', expense: '3320000', cash: '10000', probeEvents: [], owner: { fanMood, traits, takeover: { year: 1970, lastIncome: '3330000' } } };
  const p = preview.dividendOutlook(w, 100), before = w.owner.fanMood;
  engine.fanMoodDividend(w, BigInt(p.amount));
  examples.push({ kind: 'dividend', fanMood, traits, amount: p.amount, turnover: w.income, previewChange: p.mood, previewActualFormatter: formats(p.mood), settledMood: w.owner.fanMood, settledChange: w.owner.fanMood - before, deltaActualFormatter: formats(w.owner.fanMood - before), actualEngineEventParameters: w.probeEvents[0].detail.params });
}
for (const fanMood of [60, 99, 100]) {
  const w = { year: 1970, income: '0', last: '100000', probeEvents: [], owner: { fanMood, traits: [], takeover: { year: 1970, lastIncome: '100000' } } };
  const predicted = preview.injectionMood(w, '10000'), before = w.owner.fanMood;
  engine.fanMoodInjection(w, 10000n);
  examples.push({ kind: 'injection', fanMood, amount: '10000', turnover: w.last, previewChange: predicted, previewActualFormatter: formats(predicted), settledMood: w.owner.fanMood, settledChange: w.owner.fanMood - before, deltaActualFormatter: formats(w.owner.fanMood - before), actualEngineEventParameters: w.probeEvents[0].detail.params });
}
const result = { base, method: 'Executed exact pinned functions selected with TypeScript AST, actual presentation signed/moodChange/createLocaleFormatters (Intl) and actual engine event parameter formatting. Canonical result/turnover reads and event sink injected; no world generation, progression, mounted UI or suite execution.', exactMinusPoint15: { IntlDirect: new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(-0.15), moodChangeActual: formats(-0.15) }, examples };
fs.writeFileSync('/tmp/fi09-scout-capital-numeric.json', JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
