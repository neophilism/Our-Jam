import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  development,
  validateDevelopmentEnvironment,
} from "./deploy-development.mjs";

// Only the approved isolated host. Never print credentials, cookies or API bodies.
export async function checkDevelopmentSessions({
  values,
  fetchImpl = fetch,
  log = console.log,
}) {
  validateDevelopmentEnvironment(values);
  const check = (ok, name) => {
    if (!ok) throw new Error(name + ": FAIL");
    log(name + ": PASS");
  };
  const request = async (
    path,
    { method = "GET", cookie, body, origin = development.origin } = {},
  ) => {
    let response;
    try {
      response = await fetchImpl(development.origin + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: {
          origin,
          ...(cookie ? { cookie } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error(
        "Hosted session request failed; credentials and response bodies suppressed.",
      );
    }
    return response;
  };
  const data = async (path, cookie) => {
    const response = await request(path, { cookie });
    check(response.status === 200, path);
    return response.json();
  };
  const cookies = {};
  const logout = async (role, cookie) =>
    request(`/api/${role}/logout`, { method: "POST", cookie, body: {} });
  try {
    const health = await data("/api/health");
    check(
      health.application === "Our Jam" && /^[a-f0-9]{40}$/.test(health.commit),
      "Hosted application identity",
    );
    log("Hosted commit: " + health.commit);
    for (const [role, key, name] of [
      ["admin", "PLATFORM_ADMIN_TOKEN", "oj_platform_admin"],
      ["operator", "OPERATOR_TOKEN", "oj_operator"],
    ]) {
      const response = await request(`/api/${role}/login`, {
        method: "POST",
        body: { token: values[key] },
      });
      check(response.status === 200, `${role} positive login`);
      const header = response.headers
        .getSetCookie()
        .find((s) => s.startsWith(name + "="));
      // Save before assertions so an assertion failure still revokes the session.
      cookies[role] = header?.split(";")[0];
      check(
        Boolean(cookies[role]) &&
          /;\s*HttpOnly/i.test(header) &&
          /;\s*Secure/i.test(header) &&
          /;\s*SameSite=Strict/i.test(header),
        `${role} secure session cookie`,
      );
    }
    const setup = await data("/api/admin/commerce", cookies.admin);
    await data("/api/admin/voting", cookies.admin);
    const comparison = await data("/api/admin/comparison/settings", cookies.admin);
    check(
      Array.isArray(comparison.providers) &&
        comparison.providers.length === 6 &&
        Array.isArray(comparison.selectedProviders) &&
        comparison.selectedProviders.length >= 1 &&
        Number.isInteger(comparison.revision),
      "Integrated comparison engine settings",
    );
    const batches = await data("/api/admin/comparisons", cookies.admin);
    check(Array.isArray(batches.batches), "Integrated comparison batch listing");
    const rates = await data("/api/admin/comparison/rates", cookies.admin);
    check(
      Array.isArray(rates.rates) && typeof rates.warning === "string",
      "Integrated comparison cost rate listing",
    );
    check(
      (await data("/api/admin/session", cookies.admin)).admin === true,
      "Administrator session restoration",
    );
    check(
      setup.storageConfigured &&
        setup.setup.identity.enabled &&
        setup.setup.identity.trustedOrigin === development.origin &&
        setup.setup.identity.callbacks.google ===
          development.auth + "/callback/google",
      "Hosted setup storage and identity configuration",
    );
    check(
      setup.setup.stripe.mode === "test" &&
        setup.setup.stripe.webhookUrl ===
          development.origin + "/api/webhooks/stripe",
      "Sandbox webhook setup",
    );
    const expectedMissing = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ].filter((k) => !values[k]);
    check(
      JSON.stringify([...setup.setup.stripe.missingEnvironment].sort()) ===
        JSON.stringify(expectedMissing.sort()),
      "Credential diagnostics match configuration",
    );
    log("Stripe configured: " + Boolean(setup.paymentsConfigured));
    log("Missing credentials: " + (expectedMissing.join(", ") || "none"));
    check(
      !(await data("/api/session", cookies.admin)).operator,
      "Administrator does not gain performer session",
    );
    check(
      (await data("/api/session", cookies.operator)).operator === true,
      "Performer session restoration",
    );
    await data("/api/operator/events", cookies.operator);
    for (const [path, cookie, name] of [
      [
        "/api/operator/events",
        cookies.admin,
        "Administrator cannot access performer data",
      ],
      [
        "/api/admin/commerce",
        cookies.operator,
        "Performer cannot access commerce administration",
      ],
      [
        "/api/admin/voting",
        cookies.operator,
        "Performer cannot access voting administration",
      ],
      [
        "/api/admin/comparison/settings",
        cookies.operator,
        "Performer cannot access comparison engine administration",
      ],
      [
        "/api/admin/comparisons",
        cookies.operator,
        "Performer cannot access private comparison batches",
      ],
      [
        "/api/admin/comparison/rates",
        cookies.operator,
        "Performer cannot access comparison rate cards",
      ],
    ])
      check((await request(path, { cookie })).status === 401, name);
    for (const role of ["admin", "operator"]) {
      check(
        (
          await request(`/api/${role}/logout`, {
            method: "POST",
            cookie: cookies[role],
            body: {},
            origin: "https://invalid.example",
          })
        ).status === 403,
        `${role} authenticated cross-origin write denied`,
      );
      check(
        (await logout(role, cookies[role])).status === 200,
        `${role} positive logout`,
      );
      const path =
        role === "admin" ? "/api/admin/commerce" : "/api/operator/events";
      check(
        (await request(path, { cookie: cookies[role] })).status === 401,
        `${role} logged-out cookie replay denied`,
      );
      delete cookies[role];
    }
    return {
      commit: health.commit,
      paymentsConfigured: Boolean(setup.paymentsConfigured),
      missingCredentials: expectedMissing,
    };
  } finally {
    for (const [role, cookie] of Object.entries(cookies)) {
      const response = await logout(role, cookie);
      if (response.status !== 200)
        throw new Error("Diagnostic session cleanup failed.");
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let values;
  try {
    values = process.argv[2]
      ? JSON.parse(await readFile(process.argv[2], "utf8"))
      : process.env;
  } catch {
    console.error(
      "Cannot read private development configuration; contents suppressed.",
    );
    process.exit(1);
  }
  checkDevelopmentSessions({ values }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
