// Blocks until every named file exists (or the minutes run out): node wait.mjs <minutes> <file> ...
import { existsSync } from 'node:fs';

const [minutes, ...files] = process.argv.slice(2);
const until = Date.now() + Number(minutes) * 60000;
const tick = () => {
  const missing = files.filter((f) => !existsSync(f));
  if (!missing.length) {
    console.log('ready');
    return;
  }
  if (Date.now() > until) {
    console.log(`timeout, missing ${missing.join(' ')}`);
    return;
  }
  setTimeout(tick, 5000);
};
tick();
