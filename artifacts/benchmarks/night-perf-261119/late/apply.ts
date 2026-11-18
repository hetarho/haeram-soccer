// Main-thread side of a day as the client takes it: the posted reply's clone, then the delta
// applied on the held head with structure sharing (client.viewOf with publish), timed per day.
import v8 from 'node:v8';
import { readFileSync } from 'node:fs';
import * as engine from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/packages/engine/src/index';
import { Host } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/host';
import { forPosting } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/viewPublisher';
import { applyViewDelta } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/protocol';
import { shareValue } from '/Users/ihaelam/project/.gusta-worktrees/haeram-soccer-7b6c81df/self-improve-np19-f1c9b1b9/apps/web/src/runtime/store';
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const [src, daysArg = '20'] = process.argv.slice(2);
const w: any = v8.deserialize(readFileSync(src!));
w.cash = '99999999999';
const host = new Host() as any;
host.world = w;
const first = host.views.publish(host.view(), undefined);
let base = first.viewSeq, client: any = structuredClone(first.view);
for (let n = 0; n < Number(daysArg); n++) {
  if (w.critical) { delete w.critical; w.revision++; }
  engine.advanceDays(w, 1, undefined, false);
  const reply = host.views.publish(host.view(), base);
  base = reply.viewSeq;
  let a = cpu();
  const posted: any = structuredClone(forPosting(reply));
  const clone = cpu() - a;
  a = cpu();
  client = applyViewDelta(client, posted.viewDelta, shareValue);
  const apply = cpu() - a;
  console.error(`${n} receive-clone ${clone.toFixed(1)} apply+share ${apply.toFixed(1)} parts ${Object.keys(posted.viewDelta.parts).length + Object.keys(posted.viewDelta.world).length} patchKB ${((posted.viewDelta.patchText?.length ?? 0) / 1e3).toFixed(0)}`);
}
