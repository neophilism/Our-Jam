import test from "node:test";
import assert from "node:assert/strict";
import {inspectSource} from "./security-static-analysis.mjs";
const find = body => inspectSource("fixture.tsx", body).map(x=>x.rule);
test("blocks dynamic execution of strings",()=>{
  assert.deepEqual(find('eval(userInput);'),["dynamic-code-execution"]);
  assert.deepEqual(find('const f = new Function("x","return x");'),["dynamic-code-execution"]);
});
test("blocks direct DOM markup injection and React unsafe sink",()=>{
  assert.deepEqual(find('node.innerHTML = untrusted;'),["unsafe-dom-html-write"]);
  assert.deepEqual(find('document.write(untrusted);'),["unsafe-dom-html-write"]);
  assert.deepEqual(find('const view = <div dangerouslySetInnerHTML={{__html: raw}} />;'),["unsafe-dom-html-write"]);
});
test("allows ordinary React output, safe text and web worker code",()=>{
  assert.deepEqual(find('const view = <p>{text}</p>; node.textContent = text;'),[]);
  assert.deepEqual(find('const v = await import("./safe.js");'),[]);
});
