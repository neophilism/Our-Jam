import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import {
  development,
  validateDevelopmentService,
  validateDevelopmentEnvironment,
} from "./deploy-development.mjs";
import { checkDevelopmentSessions } from "./check-development-sessions.mjs";

// Read-only control-plane access. No credential file, browser trace, HAR or
// storage-state artifact is written by the hosted workflow.
async function configuration() {
  if (process.argv[2])
    return JSON.parse(await readFile(process.argv[2], "utf8"));
  if (!process.env.RENDER_API_KEY)
    throw new Error("OUR_JAM_RENDER_API_KEY is required.");
  const read = async (path) => {
    let response;
    try {
      response = await fetch(
        `https://api.render.com/v1/services/${development.service}${path}`,
        {
          redirect: "error",
          signal: AbortSignal.timeout(30000),
          headers: {
            authorization: "Bearer " + process.env.RENDER_API_KEY,
            accept: "application/json",
          },
        },
      );
    } catch {
      throw new Error(
        "Development configuration read failed; secrets suppressed.",
      );
    }
    if (!response.ok)
      throw new Error(
        "Development configuration read returned HTTP " + response.status,
      );
    return response.json();
  };
  const service = await read("");
  validateDevelopmentService(service);
  if (
    service.branch !== development.branch ||
    service.autoDeployTrigger !== "off"
  )
    throw new Error("Development branch/autodeploy identity mismatch.");
  const values = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const rows = await read(
      "/env-vars?limit=100" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!Array.isArray(rows))
      throw new Error("Invalid configuration response.");
    for (const row of rows) {
      if (
        typeof row.envVar?.key !== "string" ||
        typeof row.envVar?.value !== "string"
      )
        throw new Error("Invalid environment response.");
      values[row.envVar.key] = row.envVar.value;
    }
    if (rows.length < 100) return values;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor)
      throw new Error("Configuration pagination failed.");
    cursor = next;
  }
  throw new Error("Configuration pagination exceeded bound.");
}

let browser,
  step = "Read isolated configuration";
const report = {
  startedAt: new Date().toISOString(),
  testSourceCommit: process.env.GITHUB_SHA ?? "local",
  origin: development.origin,
  checks: [],
};
const pass = (name) => {
  report.checks.push(name);
  console.log(name + ": PASS");
};
try {
  const values = await configuration();
  validateDevelopmentEnvironment(values);
  step = "Hosted API sessions";
  Object.assign(report, await checkDevelopmentSessions({ values }));
  await mkdir("hosted-evidence", { recursive: true });
  step = "Launch browser";
  browser = await chromium.launch();
  for (const mobile of [false, true]) {
    const label = mobile ? "mobile" : "desktop";
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    const activate = (locator) => (mobile ? locator.tap() : locator.click());
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    const request = (path, data) =>
      context.request.post(development.origin + path, {
        headers: { origin: development.origin },
        data,
      });
    try {
      step = label + " administrator login UI";
      await page.goto(development.origin + "/admin/commerce");
      await page
        .getByLabel("Platform admin credential", { exact: true })
        .fill(values.PLATFORM_ADMIN_TOKEN);
      await activate(
        page.getByRole("button", {
          name: "Sign in as administrator",
          exact: true,
        }),
      );
      await page
        .getByRole("heading", { name: "Platform video library", exact: true })
        .waitFor();
      await page
        .getByRole("region", { name: "Integration setup", exact: true })
        .waitFor();
      if (
        (await page
          .getByLabel("Webhook endpoint", { exact: true })
          .inputValue()) !==
        development.origin + "/api/webhooks/stripe"
      )
        throw new Error();
      if (
        (await page
          .getByLabel("google authorized redirect URI", { exact: true })
          .inputValue()) !==
        development.auth + "/callback/google"
      )
        throw new Error();
      // Capture configuration diagnostics only; never the unpublished video
      // library or the performer's potentially private event list.
      await page
        .getByRole("region", { name: "Integration setup", exact: true })
        .screenshot({
          path: `hosted-evidence/${label}-setup.png`,
        });
      pass(step);
      step =
        label + " shared administrator session after navigation and reload";
      await page.goto(development.origin + "/admin");
      await page
        .getByRole("heading", {
          name: "Voting allowance for all artists",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("heading", {
          name: "Choose the engines to compare",
          exact: true,
        })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", {
          name: "Voting allowance for all artists",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("heading", {
          name: "Choose the engines to compare",
          exact: true,
        })
        .waitFor();
      pass(step);
      step = label + " administrator logout UI";
      await page.goto(development.origin + "/admin/commerce");
      await activate(
        page.getByRole("button", { name: "Sign out", exact: true }),
      );
      await page
        .getByRole("button", { name: "Sign in as administrator", exact: true })
        .waitFor();
      if (
        (
          await context.request.get(development.origin + "/api/admin/voting")
        ).status() !== 401
      )
        throw new Error();
      pass(step);
      step = label + " performer login UI";
      await page.goto(development.origin + "/performer");
      await page
        .getByLabel("Performer credential", { exact: true })
        .fill(values.OPERATOR_TOKEN);
      await activate(
        page.getByRole("button", { name: "Open my console ↗", exact: true }),
      );
      await page
        .getByRole("heading", {
          name: "Create a jam around your songs.",
          exact: true,
        })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", {
          name: "Create a jam around your songs.",
          exact: true,
        })
        .waitFor();
      if (
        (
          await context.request.get(development.origin + "/api/admin/commerce")
        ).status() !== 401
      )
        throw new Error();
      pass(step);
      step = label + " performer logout and Google entry UI";
      if (!(await request("/api/operator/logout", {})).ok()) throw new Error();
      await page.goto(
        development.origin + "/signin?role=performer&next=%2Fperformer",
      );
      await page
        .getByRole("button", { name: "Continue with Google", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Create an account", exact: true })
        .waitFor();
      await page.screenshot({
        path: `hosted-evidence/${label}-signin.png`,
        fullPage: true,
      });
      pass(step);
    } finally {
      for (const role of ["admin", "operator"]) {
        const response = await request(`/api/${role}/logout`, {});
        if (!response.ok())
          throw new Error("Diagnostic session cleanup failed.");
      }
      await context.close();
    }
  }
  step = "Hosted commit remains unchanged through browser acceptance";
  const finalHealth = await fetch(development.origin + "/api/health", {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!finalHealth.ok || (await finalHealth.json()).commit !== report.commit)
    throw new Error();
  pass(step);
  report.result = "passed";
} catch {
  // Playwright exceptions may include typed input. Do not serialize them.
  report.result = "failed";
  report.failedStep = step;
  console.error(step + ": FAIL (credential-bearing diagnostics suppressed)");
  process.exitCode = 1;
} finally {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  await mkdir("hosted-evidence", { recursive: true });
  await writeFile(
    "hosted-evidence/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
