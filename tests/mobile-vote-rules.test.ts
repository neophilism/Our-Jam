import test from "node:test";
import assert from "node:assert/strict";
import { voteRules, canAddVote, type VoteSnapshot } from "../apps/mobile/src/votes.ts";
const state=(voteMode:"single"|"weighted",votesPerListener:number,round?:{voteLimit?:number;voteMode?:"single"|"weighted"}):VoteSnapshot=>
  ({event:{settings:{voteMode,votesPerListener}},round:round??null});
test("single-vote native mode inherits artist selection or per-round override",()=>{
  assert.deepEqual(voteRules(state("single",20)),{voteLimit:20,singleVote:true});
  assert.deepEqual(voteRules(state("single",20,{voteLimit:12})),{voteLimit:12,singleVote:true});
  assert.deepEqual(voteRules(state("single",1000)),{voteLimit:1000,singleVote:true});
});
test("weighted legacy mode retains five points and invalid limits fall back safely",()=>{
  assert.deepEqual(voteRules(state("weighted",100)),{voteLimit:5,singleVote:false});
  for(const limit of [-1,0,1001,NaN,1.5])assert.equal(voteRules(state("single",limit)).voteLimit,5);
});
test("single mode prevents repeat vote for a wave and any full-budget addition",()=>{
  assert.equal(canAddVote(1,1,20,true),false);
  assert.equal(canAddVote(0,1,20,true),true);
  assert.equal(canAddVote(1,1,5,false),true);
  assert.equal(canAddVote(0,5,5,false),false);
});
