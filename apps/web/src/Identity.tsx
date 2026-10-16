import { useEffect, useState } from "react";
import {
  createAuthClient,
  type VanillaBetterAuthClient,
} from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";
import { api } from "./api";
type Config = {
  enabled: boolean;
  authUrl: string | null;
  providers: ("google" | "github" | "vercel")[];
};
let client: VanillaBetterAuthClient | undefined,
  clientUrl = "";
async function setup() {
  const c = await api<Config>("/identity/config");
  if (c.enabled && c.authUrl && clientUrl !== c.authUrl) {
    clientUrl = c.authUrl;
    client = createAuthClient(c.authUrl, {
      adapter: BetterAuthVanillaAdapter({
        fetchOptions: { credentials: "include", timeout: 15000 },
      }),
    });
  }
  return { config: c, auth: client };
}
function checked<T extends { error?: { message?: string } | null }>(r: T) {
  if (r.error)
    throw new Error(r.error.message ?? "Sign-in could not be completed.");
  return r;
}
export function localReturn(value: string | null, fallback = "/account") {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f]/.test(value) &&
    !value.startsWith("/signin")
    ? value
    : fallback;
}
let identityEpoch = 0;
const pendingBridges = new Set<Promise<any>>();
let lastBridge:
  { token: string; role: string; epoch: number; value: any } | undefined;
async function connect(
  role: "audience" | "performer",
  auth: VanillaBetterAuthClient,
) {
  const epoch = identityEpoch;
  const task = (async () => {
    const r = checked(await auth.token());
    // The managed wrapper can serve cached session data for /token. Only a
    // JWT from its token result or documented session response may cross the bridge.
    const token =
      r.data?.token ?? checked(await auth.getSession()).data?.session?.token;
    if (epoch !== identityEpoch) throw new Error("Sign-in was cancelled.");
    if (
      !token ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      throw new Error(
        "Sign in and verify your email first. If cookies are blocked, open sign-in in your browser rather than an embedded app.",
      );
    if (
      lastBridge?.token === token &&
      lastBridge.role === role &&
      lastBridge.epoch === epoch
    )
      return lastBridge.value;
    const response = await fetch("/api/identity/session", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(15000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role, linkCurrent: true }),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(
        value.message ?? "Could not restore your Our Jam account.",
      );
    if (epoch === identityEpoch) {
      lastBridge = { token, role, epoch, value };
      localStorage.setItem("ourjam.identity.role", role);
      window.dispatchEvent(new Event("ourjam:identity-session"));
    }
    return value;
  })();
  pendingBridges.add(task);
  try {
    return await task;
  } finally {
    pendingBridges.delete(task);
  }
}
async function signOut(auth: VanillaBetterAuthClient) {
  identityEpoch++;
  lastBridge = undefined;
  localStorage.removeItem("ourjam.identity.role");
  await Promise.allSettled([...pendingBridges]);
  await api("/identity/logout", "POST", {});
  checked(await auth.signOut());
}
export function IdentityLink({
  role = "audience",
  next,
  compact = false,
}: {
  role?: "audience" | "performer";
  next?: string;
  compact?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    api<Config>("/identity/config")
      .then((c) => setAvailable(c.enabled))
      .catch(() => {});
  }, []);
  if (!available) return null;
  return (
    <a
      className="button small"
      href={`/signin?role=${role}&next=${encodeURIComponent(next ?? location.pathname)}`}
    >
      {compact ? "Sign in" : "Sign in or create an account"}
    </a>
  );
}
export function IdentitySession() {
  useEffect(() => {
    let active = true,
      running = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (running || !active) return;
      running = true;
      let delay = 60000;
      try {
        const role = localStorage.getItem("ourjam.identity.role");
        if (!document.hidden && (role === "audience" || role === "performer")) {
          const { config, auth } = await setup();
          if (config.enabled && auth && active) {
            const s = await auth.getSession();
            if (
              active &&
              s.data?.user?.emailVerified &&
              localStorage.getItem("ourjam.identity.role") === role
            ) {
              const value = await connect(role, auth);
              delay = Math.max(
                3000,
                Math.min(
                  4 * 60 * 1000,
                  new Date(value.expiresAt).getTime() - Date.now() - 30000,
                ),
              );
            }
          }
        }
      } catch {
        delay = 15000; /* Protected routes enforce expiry; sign-in provides recovery. */
      } finally {
        running = false;
        if (active) timer = setTimeout(() => void refresh(), delay);
      }
    };
    const visible = () => {
      if (!document.hidden && !running) {
        clearTimeout(timer);
        void refresh();
      }
    };
    void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return null;
}
export function SignIn() {
  const params = new URLSearchParams(location.search),
    initialRole = params.get("role") === "performer" ? "performer" : "audience";
  const [role, setRole] = useState<"audience" | "performer">(initialRole),
    [mode, setMode] = useState<
      "signin" | "signup" | "verify" | "forgot" | "reset"
    >(params.get("token") ? "reset" : "signin"),
    [config, setConfig] = useState<Config | null>(null),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  const next = localReturn(
    params.get("next"),
    role === "performer" ? "/performer" : "/account",
  );
  useEffect(() => {
    let valid = true;
    setup()
      .then(async ({ config, auth }) => {
        if (!valid) return;
        setConfig(config);
        if (auth) {
          const s = await auth.getSession();
          if (valid) setSignedIn(Boolean(s.data?.user));
          if (params.get("complete") === "1" && s.data?.user) {
            await finish(auth, initialRole);
          }
        }
      })
      .catch((e) => {
        if (valid) setError(e.message);
      });
    return () => {
      valid = false;
    };
  }, []);
  async function finish(auth: VanillaBetterAuthClient, who = role) {
    const v = await connect(who, auth);
    if (v.profileChanged) {
      setMessage(
        "Signed in to your existing account. This browser’s separate guest profile has not been merged; its saved votes remain with that profile.",
      );
      setSignedIn(true);
    } else
      location.assign(
        localReturn(
          params.get("next"),
          who === "performer" ? "/performer" : "/account",
        ),
      );
  }
  async function action(
    work: (auth: VanillaBetterAuthClient) => Promise<void>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { auth } = await setup();
      if (!auth) throw new Error("Account sign-in is not configured yet.");
      await work(auth);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const callback =
    location.origin +
    `/signin?complete=1&role=${role}&next=${encodeURIComponent(next)}`;
  return (
    <main className="performer">
      <section className="card identity-card">
        <span className="eyebrow">YOUR PLACE IN OUR JAM</span>
        <h1>
          {mode === "signup"
            ? "Create your account."
            : mode === "forgot"
              ? "Reset your password."
              : mode === "verify"
                ? "Verify your email."
                : mode === "reset"
                  ? "Choose a new password."
                  : "Welcome back."}
        </h1>
        <p>
          Fans join and participate for free. Performers pay for their events.
        </p>
        {!config ? (
          <p>Checking sign-in options…</p>
        ) : !config.enabled ? (
          <p>
            Account sign-in is not configured on this environment yet.{" "}
            <a href="/performer">Use existing performer access</a> or join an
            event as a guest.
          </p>
        ) : (
          <>
            <label htmlFor="identity-role">I’m here as</label>
            <select
              id="identity-role"
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="audience">Audience member</option>
              <option value="performer">Performer</option>
            </select>
            {signedIn && (
              <div>
                <button
                  disabled={busy}
                  onClick={() => void action((auth) => finish(auth))}
                >
                  Continue to Our Jam
                </button>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void action(async (auth) => {
                      await signOut(auth);
                      setSignedIn(false);
                      setMessage("Signed out.");
                    })
                  }
                >
                  Sign out
                </button>
              </div>
            )}
            {["signin", "signup"].includes(mode) && (
              <>
                <div className="identity-social">
                  {config.providers.map((provider) => (
                    <button
                      key={provider}
                      className="ghost full"
                      disabled={busy}
                      onClick={() =>
                        void action(async (auth) => {
                          checked(
                            await auth.signIn.social({
                              provider,
                              callbackURL: callback,
                            }),
                          );
                        })
                      }
                    >
                      Continue with{" "}
                      {provider === "google"
                        ? "Google"
                        : provider === "github"
                          ? "GitHub"
                          : "Vercel"}
                    </button>
                  ))}
                </div>
                <p className="tiny">Or use your email</p>
              </>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(async (auth) => {
                  if (mode === "signup") {
                    checked(
                      await auth.signUp.email({
                        email,
                        password: String(f.get("password")),
                        name: String(f.get("name")),
                      }),
                    );
                    setMode("verify");
                    checked(
                      await auth.emailOtp.sendVerificationOtp({
                        email,
                        type: "email-verification",
                      }),
                    );
                    setMessage("Check your email for the verification code.");
                  } else if (mode === "signin") {
                    checked(
                      await auth.signIn.email({
                        email,
                        password: String(f.get("password")),
                      }),
                    );
                    const s = await auth.getSession();
                    if (!s.data?.user?.emailVerified) {
                      setMode("verify");
                      setMessage("Verify your email to finish signing in.");
                    } else await finish(auth);
                  } else if (mode === "verify") {
                    checked(
                      await auth.emailOtp.verifyEmail({
                        email,
                        otp: String(f.get("code")),
                      }),
                    );
                    setMode("signin");
                    setMessage("Email verified. Sign in to continue.");
                  } else if (mode === "forgot") {
                    checked(
                      await auth.requestPasswordReset({
                        email,
                        redirectTo:
                          location.origin +
                          `/signin?role=${role}&next=${encodeURIComponent(next)}`,
                      }),
                    );
                    setMessage(
                      "If this address has an account, a password-reset email is on its way.",
                    );
                  } else {
                    checked(
                      await auth.resetPassword({
                        token: params.get("token") ?? "",
                        newPassword: String(f.get("password")),
                      }),
                    );
                    history.replaceState(
                      null,
                      "",
                      `/signin?role=${role}&next=${encodeURIComponent(next)}`,
                    );
                    setMode("signin");
                    setMessage(
                      "Password updated. Sign in with your new password.",
                    );
                  }
                });
              }}
            >
              {mode === "signup" && (
                <label>
                  Display name
                  <input
                    name="name"
                    autoComplete="nickname"
                    required
                    maxLength={60}
                    disabled={busy}
                  />
                </label>
              )}
              {mode !== "reset" && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    required
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {["signin", "signup", "reset"].includes(mode) && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    minLength={8}
                    maxLength={128}
                    required
                    disabled={busy}
                  />
                </label>
              )}
              {mode === "verify" && (
                <label>
                  Verification code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]+"
                    minLength={4}
                    maxLength={12}
                    required
                    disabled={busy}
                  />
                </label>
              )}
              <button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "verify"
                      ? "Verify email"
                      : mode === "forgot"
                        ? "Send reset email"
                        : mode === "reset"
                          ? "Save new password"
                          : "Sign in"}
              </button>
            </form>
            {mode === "verify" && (
              <button
                className="ghost"
                disabled={busy}
                onClick={() =>
                  void action(async (auth) => {
                    checked(
                      await auth.emailOtp.sendVerificationOtp({
                        email,
                        type: "email-verification",
                      }),
                    );
                    setMessage("If eligible, a new code has been sent.");
                  })
                }
              >
                Resend code
              </button>
            )}
            <div className="identity-actions">
              <button
                className="ghost"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setMode(mode === "signup" ? "signin" : "signup");
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Create an account"}
              </button>
              <button
                className="ghost"
                disabled={busy}
                onClick={() => setMode("forgot")}
              >
                Forgot password?
              </button>
              <a href={next}>Continue as a guest</a>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}
