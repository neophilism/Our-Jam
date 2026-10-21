export function validateRuntimeReadiness(
  data,
  { requireMediaVerified = false, expectZeroSpend = false } = {},
) {
  if (data.database !== "ready" || data.operator !== "configured")
    throw new Error("Database or operator authentication is not ready");
  if (
    !["configured", "not_configured"].includes(data.generation) ||
    !["configured", "not_configured"].includes(data.email)
  )
    throw new Error("Unexpected generation or email readiness state");
  if (
    expectZeroSpend &&
    (data.generation !== "not_configured" || data.email !== "not_configured")
  )
    throw new Error(
      "Explicit zero-spend acceptance expects generation and email disabled",
    );
  if (
    data.media !== undefined &&
    !["configured", "verified"].includes(data.media)
  )
    throw new Error("Private media storage is not configured");
  if (requireMediaVerified && data.media !== "verified")
    throw new Error("Live private media round-trip has not been verified");
}
