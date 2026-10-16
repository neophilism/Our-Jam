import { test, expect } from "@playwright/test";
import { operatorSession } from "./helpers";
test("a phone can join, contribute, reallocate and receive another participant’s live votes", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /THREE|Shader|VALIDATE_STATUS/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Jam with the music you love." }),
  ).toBeVisible();
  const events = await (await page.request.get("/api/events")).json();
  const slug = events.events.find(
    (e: any) => e.title === "The first wave",
  ).slug;
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: "I'm in. Let's make music" }).click();
  const text = "Brass " + Date.now();
  await page.getByLabel("What would you mix this with?").fill(text);
  await page.getByRole("button", { name: "Contribute Sound Wave" }).click();
  await expect(
    page.getByRole("button", { name: "Vote for " + text, exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Vote for " + text, exact: true })
    .click();
  await expect(page.getByLabel("3 of 5 votes remaining")).toBeVisible();
  const other = await browser.newContext();
  const friend = await other.newPage();
  await friend.goto("/event/" + slug);
  await friend
    .getByRole("button", { name: "I'm in. Let's make music" })
    .click();
  await friend
    .getByRole("button", { name: "Vote for " + text, exact: true })
    .click();
  await expect(
    page.locator(".wave-row").filter({ hasText: text }),
  ).toContainText("3 votes");
  await page
    .getByRole("button", { name: "Take back a vote from " + text, exact: true })
    .click();
  await expect(page.getByLabel("4 of 5 votes remaining")).toBeVisible();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-audience.png`,
    fullPage: true,
  });
  await other.close();
  expect(errors).toEqual([]);
});
test("performer authentication is required and console can open crowd view", async ({
  page,
}) => {
  await page.goto("/performer");
  await expect(
    page.getByRole("heading", { name: "Performer access" }),
  ).toBeVisible();
  await page
    .getByLabel("Performer credential")
    .fill("browser-test-only-operator-token-123456");
  await page.getByRole("button", { name: "Open my console" }).click();
  await page
    .getByRole("link", { name: /The first wave/ })
    .first()
    .click();
  await expect(
    page.getByText("PERFORMER CONSOLE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open crowd display" }),
  ).toBeVisible();
  const events = await (await page.request.get("/api/events")).json();
  await page.goto(
    "/screen/" +
      events.events.find((e: any) => e.title === "The first wave").slug,
  );
  await expect(page.getByText("FREE · JOIN & DOWNLOAD")).toBeVisible();
  await expect(page.locator("canvas").first()).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-screen.png`,
    fullPage: true,
  });
});

test("performer owns playback, pauses voting, and recovers saved recording chunks", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/performer");
  await page
    .getByLabel("Performer credential")
    .fill("browser-test-only-operator-token-123456");
  await page.getByRole("button", { name: "Open my console" }).click();
  const slug = "control-" + Date.now();
  await expect(
    page.getByRole("heading", { name: "Create a jam around your songs." }),
  ).toBeVisible();
  const response = await page.request.post("/api/operator/events", {
    headers: { Origin: "http://127.0.0.1:4173" },
    data: {
      title: "Control rehearsal",
      artistName: "Test Artist",
      slug,
      minimumRoundSeconds: 0,
      sources: [
        {
          title: "Control source",
          corePrompt: "Synthetic test",
          durationSeconds: 180,
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/performer/" + slug);
  await page
    .getByRole("button", { name: "Use this device for show playback" })
    .click();
  await page.getByRole("button", { name: "Start the first round" }).click();
  await expect(
    page.getByRole("heading", { name: "Control source", exact: true, level: 2 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause the round", exact: true })
    .click();
  await expect(page.getByText("VOTING PAUSED")).toBeVisible();
  await page
    .getByRole("button", { name: "Resume the round", exact: true })
    .click();
  await expect(page.getByText("UNTIL THE NEXT WAVE")).toBeVisible();
  await page
    .getByRole("button", { name: "Release playback control", exact: true })
    .click();
  await expect(page.getByText("VOTING PAUSED")).toBeVisible();
  await page
    .getByRole("button", { name: "Use this device for show playback" })
    .click();
  await page
    .getByRole("button", { name: "Resume the round", exact: true })
    .click();
  await expect(page.getByText("UNTIL THE NEXT WAVE")).toBeVisible();
  // CI Chromium exposes no usable microphone backend (getUserMedia rejects
  // NotSupportedError). Supply a real synthetic MediaStream while exercising
  // the real MediaRecorder, IndexedDB writes, checksums and recovery unchanged.
  await page.evaluate(() => {
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        {
          kind: "audioinput",
          deviceId: "fixture-input",
          groupId: "fixture",
          label: "Synthetic interface",
          toJSON: () => ({}),
        },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      (window as any).__lastAudioConstraints = constraints;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await context.resume();
      const track = destination.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        oscillator.stop();
        void context.close();
        stop();
      };
      return destination.stream;
    };
  });
  await page
    .getByRole("button", { name: "Choose recording input", exact: true })
    .click();
  await page
    .getByLabel("Recording input", { exact: true })
    .selectOption("fixture-input");
  await page.getByRole("button", { name: "Record browser microphone" }).click();
  // Input permission/storage setup is asynchronous; inspect its constraints only
  // once the real encoder has started, not immediately after the click resolves.
  await expect(
    page.getByRole("button", { name: "Stop recording" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).__lastAudioConstraints.audio.deviceId,
    ),
  ).toEqual({ exact: "fixture-input" });
  await expect(page.getByText(/1 chunks saved/)).toBeVisible({
    timeout: 12000,
  });
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator(".recording summary").first()).toContainText(
    "completed",
  );
  await page.reload();
  await page.locator(".recording > details > summary").first().click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save manifest" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toContain("-manifest.json");
});

test("released credits and feedback follow real listening across an in-app navigation", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:4173";
  const post = (url: string, data: any) =>
    page.request.post("/api" + url, { headers: { Origin: origin }, data });
  await page.goto("/");
  await operatorSession(page);
  const slug = "feedback-" + Date.now();
  const created = await post("/operator/events", {
    title: "Released crowd rehearsal",
    artistName: "Test Artist",
    slug,
    minimumRoundSeconds: 0,
    sources: [
      {
        title: "Feedback source",
        corePrompt: "Synthetic test prompt",
        durationSeconds: 120,
      },
    ],
  });
  expect(created.ok()).toBeTruthy();
  const event = await created.json();
  const lease = await (
    await post(`/operator/events/${event.id}/playback/claim`, {})
  ).json();
  const start = await (
    await post(`/operator/events/${event.id}/advance`, {
      commandId: crypto.randomUUID(),
      expectedRevision: 0,
      playback: { ...lease, sequence: 1 },
    })
  ).json();
  await post("/session", {});
  await post(`/events/${slug}/join`, {});
  const name = "Listener " + Date.now();
  await page.request.patch("/api/profile", {
    headers: { Origin: origin },
    data: { name, anonymous: false },
  });
  await post(`/rounds/${start.roundId}/waves`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    text: "Warm vibraphone",
  });
  await post(`/operator/events/${event.id}/advance`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 1,
    playback: { ...lease, sequence: 2 },
  });
  const state = await (
    await page.request.get("/api/operator/events/" + slug)
  ).json();
  const media = "https://media.example.test/crowd.wav";
  const asset = await post(`/operator/jobs/${state.jobs[0].id}/asset`, {
    title: "Crowd recording fixture",
    audioUrl: media,
    downloadUrl: media,
    durationSeconds: 10,
    rightsConfirmed: true,
  });
  expect(asset.ok()).toBeTruthy();
  // Known ten-second PCM fixture. It is served only inside this browser test.
  const length = 8000 * 10,
    bytes = Buffer.alloc(44 + length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i / 8000) * 440 * Math.PI * 2) * 10000),
      44 + i * 2,
    );
  await page.route(media, (route) =>
    route.fulfill({ contentType: "audio/wav", body: bytes }),
  );
  await page.goto("/event/" + slug);
  await page.getByRole("button", { name: /Our tracks/ }).click();
  await page.getByRole("button", { name: "Listen ▷", exact: true }).click();
  await page
    .locator("audio")
    .evaluate((audio: HTMLAudioElement) => audio.play());
  await page.waitForFunction(
    () => {
      const a = document.querySelector("audio");
      return a && a.currentTime > 6;
    },
    {},
    { timeout: 15000 },
  );
  await page.getByRole("button", { name: "The room", exact: true }).click();
  await expect(page.getByLabel("Track feedback")).toContainText(
    "Crowd recording fixture",
  );
  await expect(page.locator(".leaderboard")).toContainText(name);
  await expect(page.locator(".leaderboard")).toContainText("1 waves included");
  await page.getByRole("button", { name: "Love it", exact: false }).click();
  await expect(page.getByLabel("Track feedback")).toHaveCount(0);
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Crowd recording fixture", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Remove Crowd recording fixture from likes",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Crowd recording fixture", exact: true }),
  ).toHaveCount(0);
});
