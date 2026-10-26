// Prints a time-seasons.mts log one line per season played: world, repetition, ms, digest prefix.
// usage: node artifacts/benchmarks/t450/show-times.cjs <log> [<log>…]
const fs = require('fs');
for (const file of process.argv.slice(2)) {
  console.log(`# ${file}`);
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    const x = JSON.parse(line);
    if (x.warmup) console.log(`warmup ${x.ms}`);
    else if (x.file)
      console.log(`${x.file.split('/').slice(-2).join('/')} rep${x.rep} ${x.ms} ${x.digest.slice(0, 8)}`);
    else if (x.season !== undefined && x.ms !== undefined) console.log(`season ${x.season} ${x.ms}`);
  }
}
