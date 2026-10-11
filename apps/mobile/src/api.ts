import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const configured = process.env.EXPO_PUBLIC_API_ORIGIN ?? "";
export const origin = (() => {
  try {
    const u = new URL(configured);
    return u.protocol === "https:" &&
      u.origin === configured &&
      !u.username &&
      !u.password
      ? configured
      : "";
  } catch {
    return "";
  }
})();
let token: string | null = null;
let bootstrap: Promise<void> | null = null;
const key = async () =>
  "ourjam.guest." +
  (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, origin));
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!origin)
    throw new Error(
      "This build needs its Our Jam HTTPS server address configured.",
    );
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid Our Jam path.");
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(origin + "/api" + path, {
      method,
      credentials: "omit",
      redirect: "error",
      signal: abort.signal,
      headers: {
        Origin: origin,
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.url && new URL(response.url).origin !== origin)
      throw new Error("Unexpected server redirect.");
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        data.message ?? "Our Jam could not complete that request.",
        data.error,
        response.status,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export function ensureSession() {
  if (bootstrap) return bootstrap;
  bootstrap = (async () => {
    token = await SecureStore.getItemAsync(await key());
    if (token) {
      const session = await api("/session");
      if (!session.profile)
        throw new ApiError(
          "Your guest session expired. Reset this device session to join again.",
          "expired_session",
          401,
        );
      return;
    }
    const session = await api("/mobile/session", "POST", {});
    if (!/^ojm_[a-f0-9]{64}$/.test(session.token))
      throw new Error("Invalid guest session response.");
    token = session.token;
    try {
      await SecureStore.setItemAsync(await key(), session.token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } catch (error) {
      try {
        await api("/mobile/session", "DELETE");
      } catch {}
      token = null;
      throw error;
    }
  })().catch((error) => {
    bootstrap = null;
    throw error;
  });
  return bootstrap;
}
export async function resetSession() {
  if (token) {
    try {
      await api("/mobile/session", "DELETE");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  }
  await SecureStore.deleteItemAsync(await key());
  token = null;
  bootstrap = null;
}
export function mediaUrl(value: string) {
  const url = new URL(value, origin);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("A secure media address is required.");
  return url.href;
}
export function roomCode(value: string) {
  const input = value.trim();
  if (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input) &&
    input.length >= 3 &&
    input.length <= 60
  )
    return input;
  try {
    const url = new URL(input);
    const match =
      url.protocol === "ourjam:" && url.hostname === "event"
        ? /^\/([a-z0-9-]+)$/.exec(url.pathname)
        : url.origin === origin
          ? /^\/event\/([a-z0-9-]+)$/.exec(url.pathname)
          : null;
    if (match) return roomCode(match[1]);
  } catch {}
  throw new Error("Enter the event code or its Our Jam link.");
}
