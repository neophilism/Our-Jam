import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { createEvent, advance, submitWave, allocate, snapshot } from "../apps/api/src/service.js";
import { claimPlayback } from "../apps/api/src/playback.js";
import { eventInput } from "../packages/contracts/src/index.js";
import { readPlatformVotePolicy, changePlatformVotePolicy } from "../apps/api/src/vote-policy.js";
const origin = "http://our-jam.test";
const credential = "platform-test-administrator-only-secret-123456";
const source = (name: string) => ({ title: name, corePrompt: "Original song", durationSeconds: 180 });

test("platform administrator can set fixed or artist range; performer and guest cannot", async t => {
  const db=await testDatabase();const app=await createApp(db,{origin,secureCookies:false,adminToken:credential,operatorToken:"different-operator-credential-with-32-bytes"});
  t.after(async()=>{await app.close();await db.close();});
  const url="/api/admin/voting";
  assert.equal((await app.inject({method:"GET",url})).statusCode,401);
  assert.equal((await app.inject({method:"PATCH",url,headers:{origin},payload:{}})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:"wrong"}})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url:"/api/admin/login",headers:{origin:"http://evil.invalid"},payload:{token:credential}})).statusCode,403);
  const login=await app.inject({method:"POST",url:"/api/admin/login",headers:{origin},payload:{token:credential}});
  assert.equal(login.statusCode,200,login.body);
  const adminCookie=login.cookies.find(c=>c.name==="oj_platform_admin");
  assert.ok(adminCookie?.value);assert.equal(adminCookie?.httpOnly,true);
  const headers={origin,cookie:"oj_platform_admin="+adminCookie!.value};
  const prior=(await app.inject({method:"GET",url,headers})).json();
  assert.equal(prior.mode,"fixed");assert.equal(prior.fixedVotes,5);
  const commandId=randomUUID();
  const input={commandId,expectedRevision:prior.revision,policy:{mode:"artist",minVotes:3,maxVotes:20}};
  const changed=await app.inject({method:"PATCH",url,headers,payload:input});
  assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().maxVotes,20);
  assert.equal((await app.inject({method:"PATCH",url,headers,payload:input})).statusCode,200,"safe identical retry");
  assert.equal((await app.inject({method:"PATCH",url,headers,payload:{...input,commandId:randomUUID()}})).statusCode,409);
  assert.equal((await app.inject({method:"PATCH",url,headers,payload:{commandId:randomUUID(),expectedRevision:1,policy:{mode:"artist",minVotes:21,maxVotes:3}}})).statusCode,400);
  assert.equal((await app.inject({method:"PATCH",url,headers,payload:{commandId:randomUUID(),expectedRevision:1,policy:{mode:"fixed",fixedVotes:1001}}})).statusCode,400);
  assert.equal((await app.inject({method:"GET",url,headers:{cookie:"oj_operator=definitelynotanadmin"}})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url:"/api/admin/logout",headers,payload:{}})).statusCode,200);
  assert.equal((await app.inject({method:"GET",url,headers})).statusCode,401);
  assert.equal((await db.query("SELECT count(*)::integer n FROM platform_policy_audit")).rows[0].n,1);
  const performer=await app.inject({method:"POST",url:"/api/operator/login",headers:{origin},payload:{token:"different-operator-credential-with-32-bytes"}});
  assert.equal(performer.statusCode,200,performer.body);
  const operatorCookie=performer.cookies.find(c=>c.name==="oj_operator");
  const attempt=await app.inject({method:"POST",url:"/api/operator/events",
    headers:{origin,cookie:"oj_operator="+operatorCookie!.value},
    payload:{title:"No legacy bypass",artistName:"Artist",slug:"no-weighted-"+randomUUID(),voteMode:"weighted",
      sources:[source("Song")]}});
  assert.equal(attempt.statusCode,400,attempt.body);

});

test("fixed and artist range are enforced server-side for every newly created single-vote show",async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  const first=await readPlatformVotePolicy(db);
  await changePlatformVotePolicy(db,{commandId:randomUUID(),expectedRevision:first.revision,policy:{mode:"fixed",fixedVotes:8}});
  const base={title:"Vote setup",artistName:"Indie artist",sources:[source("One")]};
  const fixed=await createEvent(db,"our-jam",eventInput.parse({...base,slug:"fixed-"+randomUUID(),voteMode:"single",votesPerListener:100}));
  const row=(await db.query("SELECT settings FROM events WHERE id=$1",[fixed.id])).rows[0];
  assert.equal(row.settings.votesPerListener,8,"fixed policy wins over artist payload");
  await changePlatformVotePolicy(db,{commandId:randomUUID(),expectedRevision:1,policy:{mode:"artist",minVotes:3,maxVotes:20}});
  const chosen=await createEvent(db,"our-jam",eventInput.parse({...base,slug:"chosen-"+randomUUID(),voteMode:"single",votesPerListener:20}));
  assert.equal((await db.query("SELECT settings FROM events WHERE id=$1",[chosen.id])).rows[0].settings.votesPerListener,20);
  await assert.rejects(createEvent(db,"our-jam",eventInput.parse({...base,slug:"too-many-"+randomUUID(),voteMode:"single",votesPerListener:21})),{code:"vote_limit_out_of_range"});
  await assert.rejects(createEvent(db,"our-jam",eventInput.parse({...base,slug:"too-few-"+randomUUID(),voteMode:"single",votesPerListener:2})),{code:"vote_limit_out_of_range"});
});

test("8 votes means 2 submitted Sound Waves and up to 6 votes on other distinct waves", async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  await changePlatformVotePolicy(db,{commandId:randomUUID(),expectedRevision:0,policy:{mode:"fixed",fixedVotes:8}});
  const event=await createEvent(db,"our-jam",eventInput.parse({
    title:"Sound Wave test",artistName:"Indie artist",slug:"eight-"+randomUUID(),
    minimumRoundSeconds:0,voteMode:"single",votesPerListener:8,
    sources:[source("Song A"),source("Song B")],
  }));
  const lease=await claimPlayback(db,"our-jam",event.id);
  const started=await advance(db,"our-jam",event.id,randomUUID(),0,{...lease,sequence:1});
  const round=started.roundId!;
  const participant=randomUUID();
  await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)",[participant,randomUUID()]);
  await db.query("INSERT INTO event_members(event_id,participant_id) VALUES($1,$2)",[event.id,participant]);
  const actor={participantId:participant};
  const one=await submitWave(db,actor,round,{commandId:randomUUID(),expectedRevision:0,text:"Dreamy strings"});
  const two=await submitWave(db,actor,round,{commandId:randomUUID(),expectedRevision:1,text:"Funky bass"});
  assert.notEqual(one.waveId,two.waveId);
  let view=await snapshot(db,event.slug,participant);
  assert.equal(view.round?.voteLimit,8);
  assert.equal(view.round?.waves.filter(w=>w.own).length,2);
  assert.equal(view.round?.waves.filter(w=>w.mine===1).length,2);
  const others=Array.from({length:7},()=>randomUUID());
  for(const [i,id] of others.entries()){
    const author=randomUUID();
    await db.query("INSERT INTO participants(id,avatar_seed) VALUES($1,$2)",[author,randomUUID()]);
    await db.query("INSERT INTO sound_waves(id,round_id,author_id,text,normalized) VALUES($1,$2,$3,$4,$5)",
      [id,round,author,"sample-"+i,"sample-"+i]);
  }
  const allocations=Object.fromEntries([one.waveId,two.waveId,...others.slice(0,6)].map(id=>[id,1]));
  await allocate(db,actor,round,{commandId:randomUUID(),expectedRevision:2,allocations});
  view=await snapshot(db,event.slug,participant);
  assert.equal(view.round?.waves.filter(w=>w.mine===1).length,8);
  await assert.rejects(allocate(db,actor,round,{commandId:randomUUID(),expectedRevision:3,allocations:{...allocations,[others[6]]:1}}),{code:"vote_budget_exceeded"});
  await assert.rejects(allocate(db,actor,round,{commandId:randomUUID(),expectedRevision:3,allocations:Object.fromEntries(others.slice(0,6).map(id=>[id,1]))}),{code:"submission_vote_required"});
  await assert.rejects(submitWave(db,actor,round,{commandId:randomUUID(),expectedRevision:3,text:"Saxophone",moveFrom:one.waveId}),{code:"submission_vote_required"});
  const after=await advance(db,"our-jam",event.id,randomUUID(),1,{...lease,sequence:2});
  assert.ok(after.roundId);
  assert.equal((await snapshot(db,event.slug,participant)).round?.voteLimit,8);
});

test("global policy edits leave open rounds unchanged and update future songs", async t=>{
  const db=await testDatabase();t.after(()=>db.close());
  const event=await createEvent(db,"our-jam",eventInput.parse({
    title:"Two songs",artistName:"Independent artist",slug:"freeze-"+randomUUID(),minimumRoundSeconds:0,
    voteMode:"single",votesPerListener:5,sources:[source("First"),source("Second")],
  }));
  const lease=await claimPlayback(db,"our-jam",event.id);
  const one=await advance(db,"our-jam",event.id,randomUUID(),0,{...lease,sequence:1});
  assert.equal((await db.query("SELECT settings FROM rounds WHERE id=$1",[one.roundId])).rows[0].settings.votesPerListener,5);
  await changePlatformVotePolicy(db,{commandId:randomUUID(),expectedRevision:0,policy:{mode:"fixed",fixedVotes:100}});
  assert.equal((await db.query("SELECT settings FROM rounds WHERE id=$1",[one.roundId])).rows[0].settings.votesPerListener,5);
  const two=await advance(db,"our-jam",event.id,randomUUID(),1,{...lease,sequence:2});
  assert.equal((await db.query("SELECT settings FROM rounds WHERE id=$1",[two.roundId])).rows[0].settings.votesPerListener,100);
});
