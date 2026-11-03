import { readFileSync, writeFileSync } from 'node:fs';
import { createWorld, operate, activateMatchModel, MATCH_MODEL_RELEASE } from '../packages/engine/src/index';
import { upgradeWorldRules } from '../packages/contracts/src/versions';
import { decode, encode } from '../apps/web/src/adapters/persistence';
import { initializeReadModels } from '../packages/engine/src/read-models';
import { CURRENT_CATALOG } from '../packages/catalogs/src/index';
const early=createWorld({ country:'ENG', name:'Pace Capacity', color:'#224466', seed:'pace-capacity-261103', level:'normal' });
const loaded=(await decode(readFileSync('haeram-2034.haeram-save.json','utf8'))).world;
const meta=[];
for(const [label,world] of [['early',early],['late',loaded]] as const) {
 const before={ year:world.year, calendar:world.calendar, rounds:world.round, ownMatches:world.ownMatches.length, events:world.events.length, seasons:world.history.length, cash:world.cash, critical:world.critical, bankrupt:world.bankrupt, model:world.matchModel };
 const w=upgradeWorldRules(structuredClone(world),CURRENT_CATALOG);
 const settings=structuredClone(w.settings!);
 for(const key of Object.keys(settings.responsibilities) as (keyof typeof settings.responsibilities)[])settings.responsibilities[key]='delegated';
 settings.mode='automatic';settings.observations={matchEve:false,windowOpen:false};
 operate(w,{type:'settings',settings});
 const activated=activateMatchModel(w,MATCH_MODEL_RELEASE);
 initializeReadModels(w);
 const raw=await encode(w,1,0);
 writeFileSync('.tmp/hr04-fixtures/'+label+'.json',raw);
 meta.push({label,before,after:{year:w.year,day:w.calendar?.day,round:w.round,matches:w.ownMatches.length,events:w.events.length,seasons:w.history.length,critical:w.critical,bankrupt:w.bankrupt,modelActivated:activated},fileBytes:Buffer.byteLength(raw),utf16:raw.length*2});
 console.log(JSON.stringify(meta.at(-1)));
}
writeFileSync('.tmp/hr04-fixtures/meta.json',JSON.stringify(meta,null,2));
