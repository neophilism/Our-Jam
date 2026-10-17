import assert from "node:assert/strict";
import { development, validateDevelopmentService, validateDevelopmentEnvironment } from "./deploy-development.mjs";

// Read-only fixed-service drift diagnosis. Print only deployment commit IDs,
// credential-NAME presence, HTTP statuses and known route names. Never print
// environment contents, auth tokens, cookies, URLs with query secrets or bodies.
async function run() {
  if (!process.env.RENDER_API_KEY) throw Error("Render API key unavailable");
  const request = async (path) => {
    const res = await fetch("https://api.render.com/v1/services/" + development.service + path, {
      redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { authorization: "Bearer " + process.env.RENDER_API_KEY, accept: "application/json" },
    });
    if (!res.ok) throw Error("Fixed Render API read HTTP " + res.status);
    return res.json();
  };
  const service = await request("");
  validateDevelopmentService(service);
  assert.equal(service.branch, development.branch);
  assert.equal(service.autoDeployTrigger, "off");
  const values = {};
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const list = await request("/env-vars?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(list)) throw Error("Unexpected env list response");
    for (const item of list) {
      if (typeof item.envVar?.key !== "string" || typeof item.envVar?.value !== "string")
        throw Error("Malformed env variable");
      values[item.envVar.key] = item.envVar.value;
    }
    if (list.length < 100) break;
    const next = list.at(-1)?.cursor;
    if (!next || next === cursor || page === 9) throw Error("Pagination mismatch");
    cursor = next;
  }
  validateDevelopmentEnvironment(values);
  console.log("Approved isolated environment: PASS");
  console.log("Custom RENDER_GIT_COMMIT environment variable present: " +
    Object.hasOwn(values, "RENDER_GIT_COMMIT"));

  const deploys = await request("/deploys?limit=5");
  if (!Array.isArray(deploys)) throw Error("Unexpected Render deploy list");
  const live = deploys.find(x => x.status === "live");
  if (!live?.commit?.id || !/^[a-f0-9]{40}$/.test(live.commit.id))
    throw Error("No verified live Render deploy commit");
  console.log("Render live deployment commit: " + live.commit.id);

  const api = async (route, fresh = false) => {
    const url = development.origin + route +
      (fresh ? ((route.includes("?") ? "&" : "?") + "check=" + Math.random().toString(36).slice(2)) : "");
    const response = await fetch(url, {
      redirect: "error", signal: AbortSignal.timeout(45000),
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
    });
    return response;
  };
  const health1 = await api("/api/health");
  const health2 = await api("/api/health", true);
  if (!health1.ok || !health2.ok) throw Error("Public health failed");
  const h1 = await health1.json(), h2 = await health2.json();
  if (h1.application !== "Our Jam" || h2.application !== "Our Jam")
    throw Error("Wrong public application");
  if (!/^[a-f0-9]{40}$/.test(h1.commit) || !/^[a-f0-9]{40}$/.test(h2.commit))
    throw Error("Bad public commit metadata");
  console.log("Public health commit normal: " + h1.commit);
  console.log("Public health commit fresh query: " + h2.commit);
  if (Object.hasOwn(values, "RENDER_GIT_COMMIT"))
    console.log("Custom commit marker matches Render live commit: " + (values.RENDER_GIT_COMMIT === live.commit.id));

  for (const route of [
    "/api/admin/comparison/settings",
    "/api/admin/comparisons",
    "/api/admin/comparison/rates",
  ]) {
    const response = await api(route, true);
    console.log("Unauthenticated " + route + ": HTTP " + response.status);
    // A current protected route MUST deny guests (401/403), not disappear (404).
    if (![401,403].includes(response.status))
      throw Error("An expected current protected route is not available: " + route);
  }
  if (h1.commit !== live.commit.id || h2.commit !== live.commit.id)
    throw Error("Public routing/commit disagrees with Render live deployment");
  console.log("Public routing, live deployment and comparison authorization: PASS");
}
run().catch(error => {
  console.error("Development routing drift check: FAIL (" +
    (String(error?.message).startsWith("Public") || String(error?.message).startsWith("An expected")
      ? String(error.message)
      : "sensitive details suppressed") + ")");
  process.exitCode = 1;
});
