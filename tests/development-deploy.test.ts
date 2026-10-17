import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const {
  development: d,
  deployDevelopment,
  validateDevelopmentEnvironment,
} = createRequire(import.meta.url)("../scripts/deploy-development.mjs");
const sha = "a".repeat(40);
const validValues = () => ({
  NODE_ENV: "production",
  PUBLIC_ORIGIN: d.origin,
  COMMERCE_ENABLED: "1",
  IDENTITY_ENABLED: "1",
  RUN_MIGRATIONS: "0",
  GENERATION_ENABLED: "0",
  RUN_INLINE_GENERATION: "0",
  EMAIL_ENABLED: "0",
  MEDIA_PROBE_ON_START: "1",
  MEDIA_ENDPOINT: d.media,
  MEDIA_REGION: "us-east-2",
  MEDIA_BUCKET: "our-jam-acceptance-media",
  MEDIA_ACCESS_KEY_ID: "fixture-access",
  MEDIA_SECRET_ACCESS_KEY: "fixture-secret",
  NEON_AUTH_BASE_URL: d.auth,
  NEON_AUTH_JWKS_URL: d.auth + "/.well-known/jwks.json",
  DATABASE_URL: `postgresql://our_jam_app:fixture-password@${d.database}/neondb?sslmode=require`,
  OPERATOR_TOKEN: "o".repeat(64),
  PLATFORM_ADMIN_TOKEN: "a".repeat(64),
});
const service = () => ({
  id: d.service,
  ownerId: d.owner,
  repo: "https://github.com/" + d.repository,
  type: "web_service",
  suspended: "suspended",
  suspenders: ["user"],
  branch: "main",
  autoDeployTrigger: "off",
  serviceDetails: { env: "docker", plan: "free", url: d.origin },
});
function harness(
  options: {
    values?: any;
    service?: any;
    native?: string;
    staleAt?: number;
    uncertainDeploy?: boolean;
    healthCommit?: string;
    readbackWrong?: boolean;
    pages?: boolean;
  } = {},
) {
  const env = {
    GITHUB_REPOSITORY: d.repository,
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/" + d.branch,
    GITHUB_SHA: sha,
    RENDER_API_KEY: "render-fixture-key",
    GITHUB_TOKEN: "github-fixture-key",
  };
  const values = options.values ?? validValues(),
    s = options.service ?? service(),
    calls: { url: string; method: string; body?: any }[] = [],
    logs: string[] = [];
  let heads = 0;
  const fetchImpl = async (url: string, init: any) => {
    assert.equal(init.redirect, "error");
    const method = init.method ?? "GET",
      body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (url.startsWith("https://api.github.com/"))
      assert.equal(init.headers.authorization, "Bearer github-fixture-key");
    else if (url.startsWith("https://api.render.com/"))
      assert.equal(init.headers.authorization, "Bearer render-fixture-key");
    else {
      assert.ok(url.startsWith(d.origin));
      assert.equal(init.headers?.authorization, undefined);
    }
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    if (url.includes("/git/ref/heads/"))
      return response({
        object: { sha: ++heads === options.staleAt ? "b".repeat(40) : sha },
      });
    if (url.includes("/actions/runs?"))
      return response({
        workflow_runs: [
          {
            id: 10,
            name: "Native iOS simulator",
            workflow_id: 381635743,
            event: "push",
            head_branch: d.branch,
            head_sha: sha,
            status: "completed",
            conclusion: options.native ?? "success",
          },
        ],
      });
    if (url.includes("/env-vars?")) {
      const rows = Object.entries(values).map(([key, value], i) => ({
        envVar: { key, value },
        cursor: "page-" + i,
      }));
      if (options.pages && !url.includes("cursor="))
        return response(
          Array.from({ length: 100 }, (_, i) => ({
            envVar: { key: "FILLER_" + i, value: "fixture" },
            cursor: "next",
          })),
        );
      return response(rows);
    }
    if (url.endsWith("/resume")) {
      s.suspended = "not_suspended";
      return new Response(null, { status: 202 });
    }
    if (url.endsWith("/deploys")) {
      if (options.uncertainDeploy)
        throw new Error(
          "Response may contain render-fixture-key and private data",
        );
      assert.equal(body.commitId, sha);
      return response({ id: "dep-fixture" }, 201);
    }
    if (url.endsWith("/deploys/dep-fixture"))
      return response({ status: "live", commit: { id: sha } });
    if (url.endsWith("/api/health"))
      return response({
        status: "ok",
        application: "Our Jam",
        commit: options.healthCommit ?? sha,
      });
    if (url.endsWith("/api/ready"))
      return response({
        database: "ready",
        operator: "configured",
        generation: "not_configured",
        email: "not_configured",
        media: "verified",
      });
    assert.equal(url, "https://api.render.com/v1/services/" + d.service);
    if (method === "PATCH" && !options.readbackWrong) Object.assign(s, body);
    return response(s);
  };
  const run = () =>
    deployDevelopment({
      env,
      fetchImpl,
      sleep: async () => {},
      log: (s: string) => logs.push(s),
    });
  const mutations = () => calls.filter((c) => c.method !== "GET");
  return { env, calls, logs, run, mutations };
}
test("development deployment validates isolated config before resume and pins a tested commit without leaking API credentials to the public app", async () => {
  const h = harness({ pages: true });
  const result = await h.run();
  assert.equal(result.commit, sha);
  assert.deepEqual(
    h.mutations().map((c) => c.method),
    ["PATCH", "POST", "POST"],
  );
  assert.ok(h.mutations().every((c) => c.url.includes(d.service)));
  assert.ok(
    !h.calls.some((c) => c.url.includes("srv-db6n9lpsrm7s73c6las0")),
    "active rehearsal never contacted",
  );
  assert.ok(
    h.calls.findIndex((c) => c.url.includes("cursor=")) <
      h.calls.findIndex((c) => c.url.endsWith("/resume")),
  );
  assert.doesNotMatch(
    h.logs.join("\n"),
    /fixture-password|fixture-secret|render-fixture-key|github-fixture-key/,
  );
});
test("missing Stripe keys do not block development deploys; a live key, wrong database or unverified media configuration does", async () => {
  for (const changed of [
    { STRIPE_SECRET_KEY: "sk_live_private" },
    { RUN_MIGRATIONS: "1" },
    { MEDIA_PROBE_ON_START: "0" },
    {
      DATABASE_URL:
        "postgresql://our_jam_app:private@production.invalid/neondb",
    },
  ]) {
    const h = harness({ values: { ...validValues(), ...changed } });
    await assert.rejects(h.run());
    assert.equal(h.mutations().length, 0);
  }
  const pooled = validValues();
  pooled.DATABASE_URL = pooled.DATABASE_URL.replace(".c-7", "-pooler.c-7");
  assert.doesNotThrow(() => validateDevelopmentEnvironment(pooled));
});
test("main, pull requests and another repository cannot use the deployment credential", async () => {
  for (const changed of [
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REPOSITORY: "someone/fork" },
  ]) {
    const h = harness();
    Object.assign(h.env, changed);
    await assert.rejects(h.run(), /approved development/);
    assert.equal(h.calls.length, 0);
  }
});
test("wrong service, paid capacity and a billing suspension cannot be repurposed by the development deployer", async () => {
  const bad = [
    { ...service(), id: "rehearsal" },
    { ...service(), ownerId: "other-workspace" },
    { ...service(), suspenders: ["billing"] },
    {
      ...service(),
      serviceDetails: { ...service().serviceDetails, plan: "starter" },
    },
  ];
  for (const s of bad) {
    const h = harness({ service: s });
    await assert.rejects(h.run());
    assert.equal(h.mutations().length, 0);
  }
});
test("failed native checks and a newer branch head stop deployment without Render mutations", async () => {
  for (const options of [{ native: "failure" }, { staleAt: 2 }]) {
    const h = harness(options);
    await assert.rejects(h.run());
    assert.equal(h.mutations().length, 0);
  }
});
test("a stale commit after configuration or an incorrect read-back never resumes the service", async () => {
  for (const options of [{ staleAt: 3 }, { readbackWrong: true }]) {
    const h = harness(options);
    await assert.rejects(h.run());
    assert.equal(h.mutations().length, 1);
  }
});
test("an uncertain deployment submission is never retried and does not echo response errors containing secrets", async () => {
  const h = harness({ uncertainDeploy: true });
  await assert.rejects(
    h.run(),
    (error: Error) =>
      !error.message.includes("render-fixture-key") &&
      error.message.includes("suppressed"),
  );
  assert.equal(
    h.calls.filter((c) => c.url.endsWith("/deploys") && c.method === "POST")
      .length,
    1,
  );
});
test("a live Render receipt is not acceptance when the public app reports a different commit", async () => {
  const h = harness({ healthCommit: "b".repeat(40) });
  await assert.rejects(h.run(), /health\/commit/);
  assert.ok(
    !h.logs.some((s) => s.startsWith("Development deployment verified:")),
  );
});
