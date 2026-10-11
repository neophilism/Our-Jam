export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Could not reach Our Jam.");
  return data;
}
export async function ensureGuest() {
  return api("/session", "POST", {});
}
export type {
  Wave,
  Release,
  EventState,
} from "../../../packages/contracts/src/public";
