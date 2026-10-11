export function publicOrigin(env: Record<string, string | undefined>) {
  const production = env.NODE_ENV === "production";
  const origin =
    env.PUBLIC_ORIGIN ??
    (env.RENDER === "true" ? env.RENDER_EXTERNAL_URL : undefined) ??
    (production ? "" : "http://localhost:5173");
  try {
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      !/^https?:\/\//.test(origin) ||
      (production && !origin.startsWith("https://"))
    )
      throw new Error();
  } catch {
    throw new Error(
      "PUBLIC_ORIGIN must be an exact HTTP origin; production requires HTTPS.",
    );
  }
  return origin;
}
