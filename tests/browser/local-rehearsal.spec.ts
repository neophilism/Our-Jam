import { test, expect, devices } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

function wav() {
  const seconds = 180, rate = 8000, bytes = Buffer.alloc(44 + seconds * rate * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < seconds * rate; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 440 / rate) * 4000), 44 + i * 2);
  return bytes;
}
async function freePort() {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
test("empty local deployment accepts a song, shows real participation and persists the zero-budget outcome", async ({ browser }) => {
  test.setTimeout(110000);
  const root = await mkdtemp(path.join(tmpdir(), "our-jam-local-e2e-"));
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined, log = "";
  const owner = await browser.newContext({ baseURL: origin });
  const guest = await browser.newContext({ baseURL: origin, ...devices["iPhone 13"] });
  const androidGuest = await browser.newContext({ baseURL: origin, ...devices["Pixel 7"] });
  const display = await browser.newContext({ baseURL: origin });
  for (const context of [owner, guest, androidGuest, display]) context.setDefaultTimeout(10000);
  async function start() {
    server = spawn(process.execPath, ["--import", "tsx", "scripts/local-rehearsal.ts"], { env: { ...process.env, NODE_ENV: "test", OUR_JAM_LOCAL_DIR: root, OUR_JAM_LOCAL_PORT: String(port), OUR_JAM_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (value) => { log = (log + value).slice(-12000); });
    server.stderr?.on("data", (value) => { log = (log + value).slice(-12000); });
    await expect.poll(async () => {
      if (server?.exitCode !== null) return 0;
      try { return (await owner.request.get("/api/health", { timeout: 1000 })).status(); } catch { return 0; }
    }, { timeout: 30000, message: "Local server did not start" }).toBe(200);
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const process = server, ended = once(process, "exit"); process.kill("SIGTERM");
    const deadline = setTimeout(() => process.kill("SIGKILL"), 3000);
    try { await ended; } finally { clearTimeout(deadline); }
  }
  try {
    await start();
    expect((await (await owner.request.get("/api/events")).json()).events).toHaveLength(0);
    const token = (await readFile(path.join(root, "performer-key.txt"), "utf8")).trim();
    expect((await owner.request.post("/api/operator/login", { headers: { Origin: origin }, data: { token } })).ok()).toBeTruthy();
    const slug = "local-real-" + Date.now();
    const created = await owner.request.post("/api/operator/events", { headers: { Origin: origin }, data: { slug, title: "Local real-file rehearsal", artistName: "Isolated browser test", minimumRoundSeconds: 0, sources: [{ title: "Actual uploaded file", corePrompt: "Private album test core", durationSeconds: 180 }] } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const event = await created.json();
    const page = await owner.newPage(); await page.goto("/performer/" + slug);
    const catalog = await (await owner.request.get(`/api/operator/events/${event.id}/sources`)).json();
    await page.getByLabel("Album track", { exact: true }).selectOption(catalog.sources[0].id);
    await page.getByLabel("MP3 or WAV file", { exact: true }).setInputFiles({ name: "test-song.wav", mimeType: "audio/wav", buffer: wav() });
    await page.getByRole("button", { name: "Upload and use this song", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Audio ready:" })).toBeVisible({ timeout: 25000 });
    await page.getByRole("button", { name: "Use this device for show playback", exact: true }).click();
    await page.getByRole("button", { name: "Start the first round", exact: false }).click();
    const audio = page.locator(".show-player audio");
    await expect.poll(() => audio.evaluate((a: HTMLMediaElement) => a.currentTime), { timeout: 15000 }).toBeGreaterThan(0.1);
    await expect.poll(async () => (await (await owner.request.get(`/api/operator/events/${slug}`)).json()).round?.state).toBe("open");
    const audience = await guest.newPage(), androidAudience = await androidGuest.newPage(), screen = await display.newPage();
    await screen.goto("/screen/" + slug); await audience.goto("/event/" + slug);
    await audience.getByRole("button", { name: /^I'm in\. Let's make music/ }).click();
    await expect(audience.getByLabel("What would you add to this song?")).toBeEnabled();
    await audience.getByLabel("What would you add to this song?").fill("Local brass section");
    await audience.getByRole("button", { name: "Contribute Sound Wave" }).click();
    await expect(screen.getByText("Local brass section", { exact: true }).first()).toBeVisible();
    await androidAudience.goto("/event/" + slug);
    await androidAudience.getByRole("button", { name: /^I'm in\. Let's make music/ }).click();
    await expect(androidAudience.getByLabel("What would you add to this song?")).toBeEnabled();
    await androidAudience.getByLabel("What would you add to this song?").fill("Android cello section");
    await androidAudience.getByRole("button", { name: "Contribute Sound Wave" }).click();
    await expect(screen.getByText("Android cello section", { exact: true }).first()).toBeVisible();
    await expect(screen.getByText("Local brass section", { exact: true }).first()).toBeVisible();
    await screen.screenshot({ path: `test-results/${test.info().project.name}-local-real-stage.png`, fullPage: true });
    await page.getByRole("button", { name: "Next track & close round", exact: false }).click();
    await expect.poll(async () => (await (await owner.request.get(`/api/operator/events/${event.id}/generation-provider`)).json()).jobs[0]?.reason, { timeout: 10000 }).toBe("approved_budget_zero");
    await page.getByText("Generation activity", { exact: false }).click();
    await expect(page.getByText("Stable Audio: blocked", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/${test.info().project.name}-local-real-console.png`, fullPage: true });
    await page.close(); await audience.close(); await androidAudience.close(); await screen.close();
    await stop(); await start();
    const restored = await (await owner.request.get("/api/events")).json();
    expect(restored.events.some((item: any) => item.slug === slug)).toBe(true);
    expect((await (await owner.request.get(`/api/operator/events/${event.id}/generation-provider`)).json()).jobs[0].reason).toBe("approved_budget_zero");
  } catch (error) {
    throw new Error(String(error) + "\nLocal server diagnostics:\n" + log);
  } finally {
    await Promise.allSettled([owner.close(), guest.close(), androidGuest.close(), display.close()]);
    await stop(); await rm(root, { recursive: true, force: true });
  }
});
