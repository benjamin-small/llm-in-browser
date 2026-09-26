// Execute the actual compiled WASM modules as libraries, without a browser UI.
// Browser generation and UI integration are checked separately through CUA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import flareInit,{FlareTokenizer} from '../.cache/flare-pkg/flare_web.js';
import stationInit,{StationGraph} from '../.cache/station-pkg/station_core.js';
import {boundPrompt,chatTemplate,renderRequest} from '../src/prompt.ts';
const read=p=>fs.readFileSync(p);
const json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(read(p)).digest('hex');
await flareInit({module_or_path:read('.cache/flare-pkg/flare_web_bg.wasm')});
await stationInit({module_or_path:read('.cache/station-pkg/station_core_bg.wasm')});
const tokenizer=FlareTokenizer.from_json(read('.cache/models/tokenizer.json').toString());
const graph=new StationGraph(read('public/data/station.json').toString());
const system=json('public/data/prompt.json').system;
let cases=0,tokens=0;
for(const split of ['validation','test'])for(const rag of [false,true]) {
  const path=`artifacts/evaluation/${split}-tuned-q8${rag?'-retrieval':''}.json`;
  for(const row of json(path).results) {
    const r=JSON.parse(graph.retrieve(row.case.question,'[]',row.case.event?JSON.stringify(row.case.event):''));
    if(!rag)r.facts=[];
    assert.deepEqual(r.facts,row.evidence,`${path}: ${row.case.id}: retrieval`);
    const prompt=chatTemplate([{role:'system',content:system},{role:'user',content:renderRequest(row.case.question,r)}]);
    assert.equal(prompt,row.prompt,`${path}: ${row.case.id}: chat template`);
    const bounded=boundPrompt(system,[],row.case.question,r,s=>tokenizer.encode(s));
    assert.deepEqual(Array.from(bounded.ids),row.inputTokens,`${path}: ${row.case.id}: tokenizer`);
    cases++;tokens+=bounded.ids.length;
  }
}
let stressCases=0;
for(const row of json('data/tokenizer-fixtures.json')) {
  assert.deepEqual(Array.from(tokenizer.encode(row.text)),row.ids,JSON.stringify(row.text));
  stressCases++;
}
const result={passed:true,evaluationPrompts:cases,tokenIdsCompared:tokens,additionalOriginalTokenizerFixtures:stressCases,
  checks:['WASM/native Rust retrieval','original chat template','Flare WASM/native reference token IDs','original Hugging Face tokenizer fixtures'],
  patchSha256:hash('patches/flare-smollm2.patch'),tokenizerSha256:hash('.cache/models/tokenizer.json'),
  fixtureSha256:hash('data/tokenizer-fixtures.json'),scope:'Compiled WASM library checks in Node; GPU generation is verified separately in the actual browser.'};
fs.writeFileSync('reports/tokenizer-parity.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));graph.free();tokenizer.free();
