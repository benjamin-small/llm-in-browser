import test from 'node:test';
import assert from 'node:assert/strict';
import {modelBlockReason} from '../src/device.ts';
test('blocks mobile including desktop-mode iPads', () => {
 for (const device of [{userAgent:'iPhone'}, {userAgent:'Android'}, {platform:'MacIntel',maxTouchPoints:5}, {userAgentData:{mobile:true}}]) assert.ok(modelBlockReason(device));
});
test('blocks reported low RAM without assuming missing data is safe', () => {
 assert.ok(modelBlockReason({deviceMemory:4}));
 assert.ok(modelBlockReason({deviceMemory:2}));
 assert.equal(modelBlockReason({deviceMemory:8}),undefined);
 assert.equal(modelBlockReason({}),undefined);
});
