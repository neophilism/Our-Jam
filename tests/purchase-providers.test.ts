import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseLinksInput, publicPurchaseLinks, preferredPurchaseUrl } from "../packages/contracts/src/purchase-providers.js";
import { eventInput } from "../packages/contracts/src/index.js";
test("purchase destinations require HTTPS, matching provider domains and unique services", () => {
  const links = purchaseLinksInput.parse([
    { provider: "bandcamp", url: "https://artist.bandcamp.com/album/record" },
    { provider: "itunes", url: "https://music.apple.com/us/album/record" },
  ]);
  assert.equal(links.length, 2);
  assert.deepEqual(publicPurchaseLinks(links, null), links);
  for (const bad of [
    [{ provider: "bandcamp", url: "https://bad.example.com/album" }],
    [{ provider: "bandcamp", url: "https://bandcamp.com.evil.invalid/album" }],
    [{ provider: "itunes", url: "javascript:alert(1)" }],
    [{ provider: "bandcamp", url: "https://bandcamp.com" }, { provider: "bandcamp", url: "https://bandcamp.com" }],
    [{ provider: "other", url: "http://insecure.example.test/music" }],
  ]) assert.equal(purchaseLinksInput.safeParse(bad).success, false);
  assert.deepEqual(publicPurchaseLinks(undefined, "https://example.test/album"), [{ provider: "other", url: "https://example.test/album" }]);
  assert.deepEqual(publicPurchaseLinks(undefined, "javascript:alert(1)"), []);
});
test("artist setup accepts a bounded provider list and rejects invalid provider destinations", () => {
  const base = {title:"Show", artistName:"Singer", slug:"show-purchase",sources:[{title:"Song",corePrompt:"Original music",durationSeconds:60}]};
  assert.equal(eventInput.safeParse({...base,purchaseLinks:[{provider:"bandcamp",url:"https://artist.bandcamp.com/album/record"}]}).success,true);
  assert.equal(eventInput.safeParse({...base,purchaseLinks:[{provider:"spotify",url:"https://example.test"}]}).success,false);
});

test("direct routing resolves only an artist-listed provider", () => {
  const links = purchaseLinksInput.parse([
    { provider: "bandcamp", url: "https://artist.bandcamp.com/album/record" },
    { provider: "spotify", url: "https://open.spotify.com/album/123" },
  ]);
  assert.equal(preferredPurchaseUrl(links, "menu", "bandcamp"), null);
  assert.equal(preferredPurchaseUrl(links, "direct", "itunes"), null);
  assert.equal(preferredPurchaseUrl(links, "direct", "bandcamp"), "https://artist.bandcamp.com/album/record");
});
