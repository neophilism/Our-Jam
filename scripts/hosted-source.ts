export function expectedDeploymentCommit(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[a-fA-F0-9]{40}$/.test(value)) throw new Error("OUR_JAM_EXPECT_COMMIT must be a complete 40-character commit SHA.");
  return value.toLowerCase();
}
export function verifyDeploymentHealth(value: unknown, expected: string | null): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected health response");
  const health = value as Record<string, unknown>;
  if (health.status !== "ok" || health.application !== "Our Jam") throw new Error("Unexpected health response");
  const commit = typeof health.commit === "string" && /^[a-fA-F0-9]{40}$/.test(health.commit) ? health.commit.toLowerCase() : "unknown";
  if (expected !== null && commit !== expected) throw new Error("Deployed commit does not match the explicitly expected source.");
  return commit;
}
