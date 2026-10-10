import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWave, validateAllocations, compilePrompt, rankWaves, mergeIntervals, listenedSeconds } from '../packages/domain/src/index.js';
test('five integer points allow concentration but not overspending, negative or fractional values',()=>{
  validateAllocations({a:5}); validateAllocations({a:2,b:3}); validateAllocations({});
  for (const a of [{a:6},{a:3,b:3},{a:-1},{a:1.5},{a:NaN},{a:0}]) assert.throws(()=>validateAllocations(a as Record<string,number>));
});
test('wave normalization prevents visual duplicates and rejects markup and invisible controls',()=>{
  assert.deepEqual(normalizeWave('  Warm   ＢＡＳＳ '),{text:'Warm BASS',normalized:'warm bass'});
  for (const s of ['x','<script>','a\u200bb','a'.repeat(49)]) assert.throws(()=>normalizeWave(s));
});
const waves=[{id:'a',text:'Brass',votes:5,supporters:2,authorId:'x',createdAt:''},{id:'b',text:'Sub bass',votes:5,supporters:1,authorId:'y',createdAt:''},{id:'c',text:'None',votes:0,supporters:0,authorId:'z',createdAt:''}];
test('ranking has stable seeded ties independent of arrival order and hides zero support',()=>{
  assert.deepEqual(rankWaves(waves,'seed'),rankWaves([...waves].reverse(),'seed')); assert.equal(rankWaves(waves,'seed').length,2);
});
test('compiler keeps immutable core and whole ranked prefix without leapfrogging',()=>{
  const r=compilePrompt('signature',waves,200,1);assert.equal(r.selected.length,1);assert.ok(r.prompt.startsWith('signature'));
  assert.equal(compilePrompt('signature',[{...waves[0],text:'a'.repeat(100)},waves[1]],80).selected.length,0);
  assert.throws(()=>compilePrompt('signature',waves,3));
});
test('unique listening ignores seeking and overlapping replays',()=>{
  assert.deepEqual(mergeIntervals([[0,20],[10,30],[50,60]],100),[[0,30],[50,60]]);
  assert.equal(listenedSeconds([[0,30],[0,30],[80,100]],100),50);
});
