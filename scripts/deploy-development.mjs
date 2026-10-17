import { pathToFileURL } from "node:url";
import { validateRuntimeReadiness } from "./hosted-runtime-readiness.mjs";

// Deliberately fixed: this command cannot target main, rehearsal, another service,
// another workspace, paid capacity or a caller-supplied API endpoint.
export const development = Object.freeze({
  repository: "neophilism/Our-Jam",
  branch: "feature/artist-event-payments-sponsor-video",
  service: "srv-db6n4uid0e5s73aus43g",
  owner: "tea-db23jkks728c73av263g",
  origin: "https://our-jam.onrender.com",
  database: "ep-tiny-lab-b5x16bij.c-7.us-east-2.aws.neon.tech",
  auth: "https://ep-tiny-lab-b5x16bij.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth",
  media: "https://br-summer-truth-b5bwzuu2.storage.c-7.us-east-2.aws.neon.tech",
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  throw new Error(message);
};

export function validateDevelopmentService(service) {
  if (
    service.id !== development.service ||
    service.ownerId !== development.owner ||
    service.repo?.replace(/\.git$/, "") !==
      `https://github.com/${development.repository}` ||
    service.type !== "web_service" ||
    service.serviceDetails?.env !== "docker" ||
    service.serviceDetails?.plan !== "free" ||
    service.serviceDetails?.url !== development.origin
  )
    fail(
      "Development service identity, repository, runtime or free plan did not match. No changes made.",
    );
  if (
    service.suspended === "suspended" &&
    service.suspenders?.some((reason) => reason !== "user")
  )
    fail(
      "The development service has a non-user suspension. Resolve it before deployment.",
    );
}
export function validateDevelopmentEnvironment(values) {
  const fixed = {
    NODE_ENV: "production",
    PUBLIC_ORIGIN: development.origin,
    COMMERCE_ENABLED: "1",
    IDENTITY_ENABLED: "1",
    RUN_MIGRATIONS: "0",
    GENERATION_ENABLED: "0",
    RUN_INLINE_GENERATION: "0",
    EMAIL_ENABLED: "0",
    MEDIA_PROBE_ON_START: "1",
    MEDIA_ENDPOINT: development.media,
    MEDIA_BUCKET: "our-jam-acceptance-media",
    MEDIA_REGION: "us-east-2",
    NEON_AUTH_BASE_URL: development.auth,
    NEON_AUTH_JWKS_URL: development.auth + "/.well-known/jwks.json",
  };
  const missing = Object.keys(fixed).filter(
    (key) => values[key] !== fixed[key],
  );
  for (const key of [
    "DATABASE_URL",
    "OPERATOR_TOKEN",
    "PLATFORM_ADMIN_TOKEN",
    "MEDIA_ACCESS_KEY_ID",
    "MEDIA_SECRET_ACCESS_KEY",
  ])
    if (!values[key]) missing.push(key);
  if (missing.length)
    fail(
      "Development configuration needs: " + [...new Set(missing)].join(", "),
    );
  let db;
  try {
    db = new URL(values.DATABASE_URL);
  } catch {
    fail("Development DATABASE_URL is invalid.");
  }
  const pooled = development.database.replace(".c-7", "-pooler.c-7");
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    ![development.database, pooled].includes(db.hostname) ||
    db.username !== "our_jam_app" ||
    !db.password ||
    db.pathname !== "/neondb"
  )
    fail(
      "DATABASE_URL must use the isolated development database and restricted runtime role.",
    );
  if (
    [values.OPERATOR_TOKEN, values.PLATFORM_ADMIN_TOKEN].some(
      (token) => token.length < 32,
    ) ||
    values.OPERATOR_TOKEN === values.PLATFORM_ADMIN_TOKEN
  )
    fail(
      "Development performer and administrator credentials must be distinct and at least 32 characters.",
    );
  if (
    values.COMMERCE_LIVE_PAYMENTS_ACK ||
    values.STRIPE_LIVE_ACK ||
    (values.STRIPE_SECRET_KEY &&
      !/^(sk|rk)_test_/.test(values.STRIPE_SECRET_KEY))
  )
    fail("Live Stripe configuration is forbidden on this development service.");
  if (
    Boolean(values.STRIPE_SECRET_KEY) !==
      Boolean(values.STRIPE_WEBHOOK_SECRET) ||
    (values.STRIPE_WEBHOOK_SECRET &&
      !values.STRIPE_WEBHOOK_SECRET.startsWith("whsec_"))
  )
    fail(
      "Supply both sandbox Stripe secrets, or leave both unset. Other development checks do not require Stripe.",
    );
}

export async function deployDevelopment({
  env = process.env,
  fetchImpl = fetch,
  sleep = delay,
  log = console.log,
} = {}) {
  const commit = env.GITHUB_SHA;
  if (
    env.GITHUB_REPOSITORY !== development.repository ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== "refs/heads/" + development.branch ||
    !/^[a-f0-9]{40}$/.test(commit ?? "")
  )
    fail(
      "Deployment requires a push to the approved development branch in the Our Jam repository.",
    );
  if (!env.RENDER_API_KEY || !env.GITHUB_TOKEN)
    fail(
      "Set OUR_JAM_RENDER_API_KEY in GitHub Actions secrets; GitHub supplies GITHUB_TOKEN.",
    );
  const request = async (host, path, token, method = "GET", body) => {
    let response;
    try {
      response = await fetchImpl(host + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          authorization: "Bearer " + token,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      fail(
        `Deployment ${method} request failed. Response bodies and credential values are suppressed.`,
      );
    }
    if (!response.ok)
      fail(
        `Deployment ${method} request returned HTTP ${response.status}. No automatic mutation retry.`,
      );
    if (response.status === 202 || response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      fail("Deployment API returned invalid JSON.");
    }
  };
  const gh = (path) =>
    request(
      "https://api.github.com",
      `/repos/${development.repository}${path}`,
      env.GITHUB_TOKEN,
    );
  const render = (path = "", method, body) =>
    request(
      "https://api.render.com",
      `/v1/services/${development.service}${path}`,
      env.RENDER_API_KEY,
      method,
      body,
    );
  const currentHead = async () => {
    const ref = await gh("/git/ref/heads/" + development.branch);
    if (ref.object?.sha !== commit)
      fail("A newer development commit exists; this deployment is obsolete.");
  };
  await currentHead();
  // This job already depends on the full application/browser/audit/Docker job.
  // Native checks run separately, and must succeed on this exact push commit.
  let accepted = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const runs = await gh(
      `/actions/runs?head_sha=${commit}&event=push&per_page=100`,
    );
    const native = runs.workflow_runs
      ?.filter(
        (run) =>
          run.workflow_id === 381635743 &&
          run.event === "push" &&
          run.head_branch === development.branch &&
          run.head_sha === commit,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (native?.status === "completed") {
      if (native.conclusion !== "success")
        fail(
          "Exact-commit native Simulator acceptance did not pass. Nothing deployed.",
        );
      accepted = true;
      break;
    }
    if (attempt % 3 === 0)
      log("Waiting for exact-commit native Simulator acceptance.");
    await sleep(20000);
  }
  if (!accepted)
    fail(
      "Native acceptance did not complete within the deployment deadline. Nothing deployed.",
    );
  await currentHead();
  const service = await render();
  validateDevelopmentService(service);
  const values = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const rows = await render(
      "/env-vars?limit=100" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!Array.isArray(rows)) fail("Render environment response was invalid.");
    for (const row of rows) {
      if (
        typeof row.envVar?.key !== "string" ||
        typeof row.envVar?.value !== "string"
      )
        fail("Render environment response was invalid.");
      values[row.envVar.key] = row.envVar.value;
    }
    if (rows.length < 100) break;
    const next = rows.at(-1)?.cursor;
    if (!next || next === cursor || page === 9)
      fail("Render environment pagination did not complete.");
    cursor = next;
  }
  validateDevelopmentEnvironment(values);
  await render("", "PATCH", {
    branch: development.branch,
    autoDeployTrigger: "off",
  });
  const configured = await render();
  validateDevelopmentService(configured);
  if (
    configured.branch !== development.branch ||
    configured.autoDeployTrigger !== "off"
  )
    fail("Render branch/autodeploy read-back did not match. Nothing resumed.");
  await currentHead();
  if (configured.suspended === "suspended") {
    await render("/resume", "POST");
    log("Resumed only the configured development service.");
  }
  await currentHead();
  // A timeout here is uncertain. Do not automatically retry and create another deployment.
  const deployment = await render("/deploys", "POST", {
    commitId: commit,
    clearCache: "do_not_clear",
  });
  if (!/^dep-[a-zA-Z0-9]+$/.test(deployment?.id ?? ""))
    fail(
      "Render did not return a deployment receipt. Inspect its deploy list before retrying.",
    );
  log("Development deployment receipt: " + deployment.id);
  let live = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const state = await render("/deploys/" + deployment.id);
    if (state.commit?.id !== commit)
      fail("Render deployment commit did not match the accepted commit.");
    if (state.status === "live") {
      live = true;
      break;
    }
    if (
      [
        "build_failed",
        "update_failed",
        "pre_deploy_failed",
        "canceled",
        "deactivated",
      ].includes(state.status)
    )
      fail("Development deploy ended: " + state.status);
    if (attempt % 3 === 0)
      log("Development deploy status: " + String(state.status));
    await sleep(10000);
  }
  if (!live)
    fail(
      "Render deploy is still pending. Inspect the receipt before retrying.",
    );
  const publicGet = async (path) => {
    const response = await fetchImpl(development.origin + path, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      fail("Hosted development check returned HTTP " + response.status);
    return response.json();
  };
  const health = await publicGet("/api/health");
  if (
    health.status !== "ok" ||
    health.application !== "Our Jam" ||
    health.commit !== commit
  )
    fail("Hosted development health/commit did not match.");
  validateRuntimeReadiness(await publicGet("/api/ready"), {
    requireMediaVerified: true,
    expectZeroSpend: true,
  });
  log("Development deployment verified: " + commit);
  return { commit, deployment: deployment.id, origin: development.origin };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deployDevelopment().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
