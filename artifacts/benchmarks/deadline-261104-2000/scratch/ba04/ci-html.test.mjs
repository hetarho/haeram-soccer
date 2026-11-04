import assert from 'node:assert/strict';
import {jobHtml,parsed} from './ci-html.mjs';
const url='https://github.com/hetarho/haeram-soccer/actions/runs/41772636192/job/126385631983';
for (const [text,expected] of [['succeeded','success'],['failed','failure'],['cancelled','cancelled'],['timed out','timed_out']]) {
 const html=`<span data-url="/hetarho/haeram-soccer/runs/126385631983/header"> ${text} <relative-time datetime="2026-11-04T04:23:23Z"></relative-time></span><check-steps data-job-status="completed" data-use-actions-ux>`;
 assert.equal(parsed(jobHtml(html,'126385631983'),url,'checks').conclusion,expected);
 assert.equal(parsed(jobHtml(html,'1'),url,'checks').conclusion,null);
 assert.equal(parsed(jobHtml(html.replace('completed','in_progress'),'126385631983'),url,'checks').conclusion,null);
}
const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.ok,true);
assert.equal(parsed(jobHtml(await response.text(),'126385631983'),url,'checks').conclusion,'success');
console.log('CI HTML compatibility: success/failure/cancel/timeout, identity and in-progress guards, plus known completed public job passed.');
