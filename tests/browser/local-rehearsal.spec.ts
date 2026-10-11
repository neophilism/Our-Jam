import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

function wav() {
  const seconds = 60, rate = 8000, bytes = Buffer.alloc(44 + seconds * rate * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < seconds * rate; i++) bytes.writeInt16LE(Math.round(Math.sin(i * Math.PI * 440 / rate) * 4000), 44 + i * 2);
  return bytes;
}
test("empty local deployment accepts a song, shows real participation and persists the zero-budget outcome", async ({ browser }) => {
  test.setTimeout(100000);
  const root = await mkdtemp(path.join(tmpdir(), "our-jam-local-e2e-"));
  const origin = "http://127.0.0.1:4175";
  let server: ChildProcess | undefined;
  let log = "";
  const owner = await browser.newContext({ baseURL: origin });
  const guest = await browser.newContext({ baseURL: origin });
  const display = await browser.newContext({ baseURL: origin });
  async function start() {
    server = spawn(process.execPath, ["--import", "tsx", "scripts/local-rehearsal.ts"], { env: { ...process.env, NODE_ENV: "test", OUR_JAM_LOCAL_DIR: root, OUR_JAM_LOCAL_PORT: "4175", OUR_JAM_NO_OPEN: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (value) => { log = (log + value).slice(-12000); });
    server.stderr?.on("data", (value) => { log = (log + value).slice(-12000); });
    await expect.poll(async () => {
      try { return (await owner.request.get("/api/health", { timeout: 1000 })).status(); } catch { return 0; }
    }, { timeout: 30000, message: "Local server did not start" }).toBe(200);
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const ended = once(server, "exit"); server.kill("SIGTERM"); await ended;
  }
  try {
    await start();
    const before = await (await owner.request.get("/api/events")).json();
    expect(before.events).toHaveLength(0);
    const token = (await readFile(path.join(root, "performer-key.txt"), "utf8")).trim();
    const login = await owner.request.post("/api/operator/login", { headers: { Origin: origin }, data: { token } });
    expect(login.ok()).toBeTruthy();
    const slug = "local-real-" + Date.now();
    const created = await owner.request.post("/api/operator/events", { headers: { Origin: origin }, data: { slug, title: "Local real-file rehearsal", artistName: "Isolated browser test", minimumRoundSeconds: 0, sources: [{ title: "Actual uploaded file", corePrompt: "Private album test core", durationSeconds: 60 }] } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const event = await created.json();
    const page = await owner.newPage(); await page.goto("/performer/" + slug);
    const source = await (await owner.request.get(`/api/operator/events/${event.id}/sources`)).json();
    await page.getByLabel("Album track", { exact: true }).selectOption(source.sources[0].id);
    await page.getByLabel("MP3 or WAV file", { exact: true }).setInputFiles({ name: "test-song.wav", mimeType: "audio/wav", buffer: wav() });
    await page.getByRole("button", { name: "Upload and use this song", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Audio ready:" })).toBeVisible({ timeout: 25000 });
    await page.getByRole("button", { name: "Use this device for show playback", exact: true }).click();
    await page.getByRole("button", { name: "Start the first round", exact: false }).click();
    await expect(page.getByRole("button", { name: "Pause show audio", exact: true })).toBeVisible();
    const audience = await guest.newPage(), screen = await display.newPage();
    await screen.goto("/screen/" + slug);
    await audience.goto("/event/" + slug);
    await audience.getByRole("button", { name: "I'm in. Let's make music" }).click();
    await audience.getByLabel("What would you mix this with?").fill("Local brass section");
    await audience.getByRole("button", { name: "Contribute Sound Wave" }).click();
    await expect(screen.getByText("Local brass section", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Next track & close round", exact: false }).click();
    await expect.poll(async () => {
      const state = await (await owner.request.get(`/api/operator/events/${event.id}/generation-provider`)).json();
      return state.jobs[0]?.reason;
    }, { timeout: 10000 }).toBe("approved_budget_zero");
    await page.getByText("Generation activity", { exact: false }).click();
    await expect(page.getByText("Stable Audio: blocked", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/${test.info().project.name}-local-real-console.png`, fullPage: true });
    await screen.screenshot({ path: `test-results/${test.info().project.name}-local-real-stage.png`, fullPage: true });
    await page.close(); await audience.close(); await screen.close();
    await stop(); await start();
    const restored = await (await owner.request.get("/api/events")).json();
    expect(restored.events.some((item: any) => item.slug === slug)).toBe(true);
    const outcome = await (await owner.request.get(`/api/operator/events/${event.id}/generation-provider`)).json();
    expect(outcome.jobs[0].reason).toBe("approved_budget_zero");
  } catch (error) {
    throw new Error(String(error) + "\nLocal server diagnostics:\n" + log);
  } finally {
    await owner.close(); await guest.close(); await display.close();
    await stop(); await rm(root, { recursive: true, force: true });
  }
});
