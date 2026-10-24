// Read-only deployed OurJam smoke test. Never uses performer/provider credentials.
const origin = process.argv[2] ?? process.env.OUR_JAM_ORIGIN;
if (!origin || !/^https:\/\/[^/?#]+$/.test(origin) || new URL(origin).origin !== origin) {
  console.error("Supply a valid HTTPS origin without path or query.");
  process.exit(2);
}
// Retry network timeouts and transient 5xx from a cold free-tier service.
// Never retry bad authentication responses, authorization denials, or mismatched data.
async function resilientFetch(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
      if (response.status < 500 || attempt === 2) return response;
      await response.body?.cancel();
      lastError = new Error("Temporary server error " + response.status);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw lastError;
}
async function check(path, verify) {
  const response = await resilientFetch(origin + path, {redirect:"error", headers:{accept:"application/json"}});
  if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
  const data = await response.json();
  verify(data);
  console.log(path + ": PASS");
}
try {
  await check("/api/health", data => {
    if (data.status !== "ok" || data.application !== "Our Jam") throw new Error("Unexpected health response");
    console.log("Deployed commit: " + String(data.commit ?? "unknown"));
  });
  await check("/api/ready", data => {
    if (data.database !== "ready" || data.operator !== "configured")
      throw new Error("Database or operator authentication is not ready");
    if (data.generation !== "not_configured" || data.email !== "not_configured")
      throw new Error("Zero-spend rehearsal expects generation and email disabled");
    if (data.media !== undefined && !["configured", "verified"].includes(data.media))
      throw new Error("Private media storage is not configured");
    if (process.env.OUR_JAM_REQUIRE_MEDIA_VERIFIED === "1" && data.media !== "verified")
      throw new Error("Live private media round-trip has not been verified");
  });
  // Real HTTPS negative-authorization and browser-entry probes, no test users,
  // provider calls, secret-bearing URLs, event writes or uploaded files.
  const site = await resilientFetch(origin + "/performer", {
    redirect: "error", 
    headers: { "user-agent": "OurJam-Mobile-Rehearsal-Smoke/1.0" },
  });
  if (!site.ok || !site.headers.get("content-type")?.includes("text/html") ||
      !(await site.text()).includes("<html"))
    throw new Error("Hosted performer web entry is unavailable");
  console.log("/performer mobile browser entry: PASS");
  await check("/api/events", data => {
    if (!Array.isArray(data.events)) throw new Error("Public event listing is invalid");
    if (/core_prompt|corePrompt|operatorToken|MEDIA_SECRET_ACCESS_KEY/.test(JSON.stringify(data)))
      throw new Error("A private field appeared in the public event listing");
  });
  for (const path of [
    "/api/operator/album-upload-capabilities",
    "/api/operator/events",
    "/api/operator/sources/00000000-0000-4000-8000-000000000001/audio/" + "0".repeat(64),
  ]) {
    const response = await resilientFetch(origin + path, {
      redirect: "error", 
    });
    if (response.status !== 401) throw new Error("Private route did not reject an unauthenticated request: " + path);
    if (!response.headers.get("cache-control")?.includes("no-store"))
      throw new Error("Private route lacks no-store: " + path);
    console.log(path + " unauthenticated: PASS");
  }
  for (const path of ["/api/operator/login", "/api/mobile/session", "/api/session"]) {
    const response = await resilientFetch(origin + path, {
      method: "POST", redirect: "error", 
      headers: { "content-type": "application/json", origin: "https://untrusted.example.invalid" },
      body: "{}",
    });
    if (response.status !== 403) throw new Error("Cross-origin mutation was not rejected: " + path);
    console.log(path + " cross-origin denied: PASS");
  }
} catch (error) {
  console.error("Hosted rehearsal smoke FAIL:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}
