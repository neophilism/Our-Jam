import test from "node:test";
import assert from "node:assert/strict";
import { allocateSharedGpuCost, summarizeProviderCosts } from "../packages/providers/src/comparison-cost-allocation.js";

test("GPU idle/shared cost is allocated once, deterministically, without floating point drift", () => {
  const allocations = allocateSharedGpuCost(101, [
    {runId:"a",gpuSeconds:2},{runId:"b",gpuSeconds:1},{runId:"c",gpuSeconds:1},
  ]);
  assert.deepEqual(allocations, [
    {runId:"a",allocatedMicroUsd:51},
    {runId:"b",allocatedMicroUsd:25},
    {runId:"c",allocatedMicroUsd:25},
  ]);
  assert.equal(allocations.reduce((sum,x)=>sum+x.allocatedMicroUsd,0),101);
  assert.deepEqual(allocateSharedGpuCost(1,[{runId:"b",gpuSeconds:1},{runId:"a",gpuSeconds:1}]),[
    {runId:"b",allocatedMicroUsd:0},{runId:"a",allocatedMicroUsd:1},
  ]);
});
test("unattributed paid GPU uptime cannot silently disappear", () => {
  assert.throws(()=>allocateSharedGpuCost(9,[]));
  assert.throws(()=>allocateSharedGpuCost(9,[{runId:"a",gpuSeconds:0}]));
  assert.throws(()=>allocateSharedGpuCost(-1,[{runId:"a",gpuSeconds:1}]));
  assert.throws(()=>allocateSharedGpuCost(1,[{runId:"a",gpuSeconds:1},{runId:"a",gpuSeconds:2}]));
});
test("cost per usable track accounts for failures and never treats unmeasured runs as zero cost", () => {
  const runs=[
    {runId:"a",providerId:"ace_step",successful:true,usable:true},
    {runId:"b",providerId:"ace_step",successful:false,usable:false},
    {runId:"c",providerId:"mureka",successful:true,usable:false},
  ];
  const rows=[
    {runId:"a",providerId:"ace_step",source:"gpu" as const,certainty:"measured" as const,amountMicroUsd:60000},
    {runId:"b",providerId:"ace_step",source:"gpu" as const,certainty:"estimated" as const,amountMicroUsd:40000},
    {runId:"c",providerId:"mureka",source:"api" as const,certainty:"reconciled" as const,amountMicroUsd:170000},
  ];
  const result=summarizeProviderCosts(runs,rows);
  assert.equal(result[0].costPerUsableMicroUsd,100000);
  assert.equal(result[0].estimatedMicroUsd,40000);
  assert.equal(result[0].measuredMicroUsd,60000);
  assert.equal(result[1].costPerUsableMicroUsd,null);
  assert.equal(result[1].costPerSuccessMicroUsd,170000);
  assert.deepEqual(summarizeProviderCosts(runs,rows.slice(0,1))[0].costsComplete,false);
  assert.equal(summarizeProviderCosts(runs,rows.slice(0,1))[0].costPerUsableMicroUsd,null);
});
test("rejects orphan charges, negatives, duplicate runs and impossible outcomes", () => {
  assert.throws(()=>summarizeProviderCosts([], [{runId:"x",providerId:"x",amountMicroUsd:1,source:"gpu",certainty:"estimated"}]));
  assert.throws(()=>summarizeProviderCosts([{runId:"x",providerId:"x",successful:false,usable:true}],[]));
  assert.throws(()=>summarizeProviderCosts([
    {runId:"x",providerId:"x",successful:true,usable:true},
    {runId:"x",providerId:"x",successful:true,usable:true},
  ],[]));
  assert.throws(()=>summarizeProviderCosts([{runId:"x",providerId:"x",successful:true,usable:true}],
    [{runId:"x",providerId:"x",amountMicroUsd:-1,source:"gpu",certainty:"estimated"}]));
});
