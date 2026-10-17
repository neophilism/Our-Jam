import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";

const destinations = [
  { provider: "bandcamp", url: "https://artist.bandcamp.com/album/test-record" },
  { provider: "spotify", url: "https://open.spotify.com/album/123456" },
];

test("artist can show a provider menu or send listeners directly to one storefront", async ({ page }) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/");
  await operatorSession(page);
  const prefix = Date.now() + "-" + test.info().project.name;
  async function create(mode: "menu" | "direct") {
    const slug = "stores-" + mode + "-" + prefix;
    const response = await page.request.post("/api/operator/events", {
      headers: { Origin: origin },
      data: {
        title: "Store choices " + mode, artistName: "Local independent artist", slug,
        purchaseLinks: destinations, purchaseMode: mode,
        ...(mode === "direct" ? {preferredPurchaseProvider:"bandcamp"} : {}),
        sources: [{ title: "Test recording", corePrompt: "Original artist track", durationSeconds: 180 }],
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return slug;
  }
  const menuSlug = await create("menu");
  const directSlug = await create("direct");
  await page.goto("/event/" + menuSlug);
  await page.getByRole("button", {name:"Get the album", exact:false}).click();
  const menu = page.getByRole("group", { name: "Choose an album provider" });
  await expect(menu.getByRole("link", {name:"Bandcamp", exact:false})).toHaveAttribute("href", destinations[0].url);
  await expect(menu.getByRole("link", {name:"Spotify", exact:false})).toHaveAttribute("href", destinations[1].url);
  await page.goto("/event/" + directSlug);
  await expect(page.getByRole("link", {name:"Get the album", exact:false})).toHaveAttribute("href",destinations[0].url);
  await expect(page.getByRole("group", {name:"Choose an album provider"})).toHaveCount(0);
  await page.goto("/performer/" + directSlug);
  await page.getByText("Event, screen & participation settings", {exact:true}).click();
  await expect(page.getByLabel("Preferred purchase provider")).toHaveValue("bandcamp");
  await page.getByLabel("Show a menu of all my providers").check();
  await page.getByRole("button", {name:"Save show settings"}).click();
  await expect.poll(async () => (await (await page.request.get("/api/events/" + directSlug)).json()).event.purchaseMode).toBe("menu");
  await page.goto("/event/" + directSlug);
  await page.getByRole("button", {name:"Get the album",exact:false}).click();
  await expect(page.getByRole("group", {name:"Choose an album provider"})).toBeVisible();
});

test("invalid direct destinations cannot be saved or used for outbound navigation", async ({ page }) => {
  const origin = "http://127.0.0.1:4173";
  await page.goto("/");
  await operatorSession(page);
  const response = await page.request.post("/api/operator/events", {
    headers: {Origin:origin},
    data: {
      title:"Invalid redirect", artistName:"Indie performer", slug:"invalid-direct-" + Date.now(),
      purchaseLinks:destinations, purchaseMode:"direct", preferredPurchaseProvider:"itunes",
      sources:[{title:"My song",corePrompt:"Test",durationSeconds:180}],
    },
  });
  expect(response.status()).toBe(400);
});
