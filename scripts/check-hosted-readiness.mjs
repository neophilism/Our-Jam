// Read-only deployed OurJam smoke test. Never uses performer/provider credentials.
const origin = process.argv[2] ?? process.env.OUR_JAM_ORIGIN;
if (!origin || !/^https:\/\/[^/?#]+$/.test(origin) || new URL(origin).origin !== origin) {
  console.error("Supply a valid HTTPS origin without path or query.");
  process.exit(2);
}
async function check(path, verify) {
  const response = await fetch(origin + path, {redirect:"error", signal:AbortSignal.timeout(20000), headers:{accept:"application/json"}});
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
} catch (error) {
  console.error("Hosted rehearsal smoke FAIL:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}
