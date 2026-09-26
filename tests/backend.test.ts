import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeBackend } from '../src/backend.ts';
test('missing WebGPU and device failures produce actionable CPU fallback',async()=>{
  assert.match((await initializeBackend({init_gpu:async()=>false},'auto'))!,/unavailable.*CPU/);
  assert.match((await initializeBackend({init_gpu:async()=>{throw new Error('Device request failed');}},'auto'))!,/Using CPU.*Device request failed/);
});
test('explicit CPU selection does not request a GPU device',async()=>{
  let called=false;await initializeBackend({init_gpu:async()=>{called=true;return true;}},'cpu');assert.equal(called,false);
  assert.equal(await initializeBackend({init_gpu:async()=>true},'auto'),undefined);
});
