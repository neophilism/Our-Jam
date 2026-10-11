import { test, expect, type Page } from "@playwright/test";
import { operatorSession } from "./helpers";

async function outputs(page: Page) {
  await page.addInitScript(() => {
    const state = {
      outputs: [
        {
          deviceId: "show-speaker",
          kind: "audiooutput",
          label: "Show speaker",
          groupId: "speaker",
        },
        {
          deviceId: "cue-headphones",
          kind: "audiooutput",
          label: "Cue headphones",
          groupId: "headphones",
        },
      ],
      calls: [] as string[],
      fail: "",
    };
    (window as any).__routing = state;
    const sinks = new WeakMap<HTMLMediaElement, string>();
    Object.defineProperty(HTMLMediaElement.prototype, "sinkId", {
      configurable: true,
      get() {
        return sinks.get(this) ?? "";
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: async function (id: string) {
        state.calls.push(id);
        if (state.fail === id)
          throw new DOMException("Fixture output disappeared", "NotFoundError");
        sinks.set(this, id);
      },
    });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () => state.outputs,
    });
  });
}
function wav() {
  const rate = 8000,
    bytes = Buffer.alloc(44 + rate * 20 * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < rate * 20; i++)
    bytes.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 880) * 3000),
      44 + i * 2,
    );
  return bytes;
}

test("separate outputs require audible tests and confirmation; lost output releases show control", async ({
  page,
}) => {
  await outputs(page);
  await page.goto("/");
  await operatorSession(page);
  const slug = "routing-" + Date.now(),
    origin = "http://127.0.0.1:4173";
  const created = await page.request.post("/api/operator/events", {
    headers: { Origin: origin },
    data: {
      slug,
      title: "Output rehearsal",
      artistName: "Artist",
      minimumRoundSeconds: 0,
      releaseMode: "immediate",
      sources: [
        {
          title: "Voting source",
          corePrompt: "Initial private source",
          durationSeconds: 60,
        },
        {
          title: "Routed source",
          corePrompt: "Private source",
          durationSeconds: 20,
          audioUrl: "https://media.example.test/show.wav",
        },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const event = await created.json();
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post("/api" + path, {
      headers: { Origin: origin },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const lease = await post(`/operator/events/${event.id}/playback/claim`, {});
  const opened = await post(`/operator/events/${event.id}/advance`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    playback: { ...lease, sequence: 1 },
  });
  await post("/session", {});
  await post(`/events/${slug}/join`, {});
  await post(`/rounds/${opened.roundId}/waves`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 0,
    text: "Glass keys",
  });
  await post(`/operator/events/${event.id}/advance`, {
    commandId: crypto.randomUUID(),
    expectedRevision: 1,
    playback: { ...lease, sequence: 2 },
  });
  const current = await (
    await page.request.get(`/api/operator/events/${slug}`)
  ).json();
  await post(`/operator/jobs/${current.jobs[0].id}/asset`, {
    title: "Cue creation",
    audioUrl: "https://media.example.test/show.wav",
    downloadUrl: "https://media.example.test/show.wav",
    durationSeconds: 20,
    rightsConfirmed: true,
  });
  await post(`/operator/events/${event.id}/playback/release`, {
    ...lease,
    sequence: 3,
    commandId: crypto.randomUUID(),
    pause: true,
  });
  await page.route("https://media.example.test/show.wav", (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: wav() }),
  );
  await page.goto("/performer/" + slug);
  await page.getByText("Speaker & headphone outputs", { exact: true }).click();
  await page
    .getByLabel("Show output", { exact: true })
    .selectOption("show-speaker");
  await page
    .getByLabel("Headphone preview output", { exact: true })
    .selectOption("show-speaker");
  const confirm = page.getByLabel(
    "I heard the show test only through the speaker and the preview test only in my headphones.",
  );
  await expect(confirm).toBeDisabled();
  await page
    .getByLabel("Headphone preview output", { exact: true })
    .selectOption("cue-headphones");
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "Test show output", exact: true })
    .click();
  await expect(
    page.getByText("Test sound played", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Test preview output", exact: true })
    .click();
  await expect(confirm).toBeEnabled();
  await confirm.check();
  await expect(page.getByRole("status")).toHaveText(
    "Separate-output cueing enabled for this tab.",
  );
  await page
    .getByRole("button", {
      name: "Use this device for show playback",
      exact: true,
    })
    .click();
  const show = page.locator(".show-player audio");
  await expect
    .poll(() => show.evaluate((a: HTMLMediaElement) => a.sinkId))
    .toBe("show-speaker");
  await expect(page.getByLabel("Show output", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("UNTIL THE NEXT WAVE", { exact: true }),
  ).toBeVisible();
  const previewButton = page.getByRole("button", {
    name: "Headphone preview",
    exact: false,
  });
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  const cue = page.locator(".private-preview audio");
  await expect
    .poll(() => cue.evaluate((a: HTMLMediaElement) => a.sinkId))
    .toBe("cue-headphones");
  await expect
    .poll(() => cue.evaluate((a: HTMLMediaElement) => a.currentTime))
    .toBeGreaterThan(0.05);
  await page.evaluate(() => {
    (window as any).__routing.outputs = [
      {
        deviceId: "show-speaker",
        kind: "audiooutput",
        label: "Show speaker",
        groupId: "speaker",
      },
    ];
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(cue).toHaveCount(0);
  await expect(previewButton).toBeDisabled();
  await expect
    .poll(() => show.evaluate((a: HTMLMediaElement) => a.paused))
    .toBe(false);
  await page.evaluate(() => {
    (window as any).__routing.outputs = [
      {
        deviceId: "cue-headphones",
        kind: "audiooutput",
        label: "Cue headphones",
        groupId: "headphones",
      },
    ];
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await expect(
    page.getByText("The selected show output disappeared.", { exact: false }),
  ).toBeVisible();
  await expect(confirm).not.toBeChecked();
  await expect
    .poll(() => show.evaluate((a: HTMLMediaElement) => a.paused))
    .toBeTruthy();
  await expect(
    page.getByRole("button", {
      name: "Use this device for show playback",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("VOTING PAUSED", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Use this device for show playback",
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-audio-routing.png`,
    fullPage: false,
  });
  await page.reload();
  await page.getByText("Speaker & headphone outputs", { exact: true }).click();
  await expect(page.getByLabel("Show output", { exact: true })).toHaveValue("");
  await expect(confirm).not.toBeChecked();
});

test("a refused output does not replace the selection or silently use the default device", async ({
  page,
}) => {
  await outputs(page);
  await page.goto("/");
  await operatorSession(page);
  const events = await (await page.request.get("/api/events")).json(),
    slug = events.events.find((e: any) => e.title === "The first wave").slug;
  await page.goto("/performer/" + slug);
  await page.getByText("Speaker & headphone outputs", { exact: true }).click();
  await page.evaluate(() => {
    (window as any).__routing.fail = "cue-headphones";
  });
  await page
    .getByLabel("Headphone preview output", { exact: true })
    .selectOption("cue-headphones");
  await expect(page.getByRole("alert")).toHaveText(
    "That audio output could not be selected. Check permission and connection; no fallback output was chosen.",
  );
  await expect(
    page.getByLabel("Headphone preview output", { exact: true }),
  ).toHaveValue("");
  expect(
    await page.evaluate(() => (window as any).__routing.calls),
  ).not.toContain("");
});
