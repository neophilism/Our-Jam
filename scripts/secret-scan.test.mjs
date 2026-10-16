import test from "node:test";
import assert from "node:assert/strict";
import { inspect } from "./secret-scan.mjs";
test("detects private keys and strong credential signatures without displaying values", () => {
  assert.deepEqual(inspect("foo.txt", Buffer.from("-----BEGIN PRIVATE KEY-----")), ["private-key"]);
  assert.deepEqual(inspect("foo.env", Buffer.from("AWS=AKIA" + "A".repeat(16))), ["aws-access-key"]);
  assert.deepEqual(inspect("foo.env", Buffer.from("KEY=nak_live_" + "a".repeat(34))), ["neon-live-credential"]);
});
test("does not reject documentation placeholders, secret names or binary media", () => {
  assert.deepEqual(inspect("README.md", Buffer.from("MUREKA_API_KEY= OPERATOR_TOKEN= DATABASE_URL=")), []);
  assert.deepEqual(inspect("image.png", Buffer.from("-----BEGIN PRIVATE KEY-----")), []);
  assert.deepEqual(inspect("media.wav", Buffer.from([0,1,2,3])), []);
});
