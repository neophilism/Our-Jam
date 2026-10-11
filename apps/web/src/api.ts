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
export type Wave = {
  id: string;
  text: string;
  votes: number;
  supporters: number;
  mine: number;
  own: boolean;
  name: string;
  avatarSeed: string;
};
export type Release = {
  id: string;
  title: string;
  audio_url: string;
  download_url: string;
  duration_seconds: number;
  published_at: string;
  likes: number;
  dislikes?: number;
  plays: number;
  reaction?: number;
};
export type EventState = {
  serverTime: string;
  event: {
    id: string;
    slug: string;
    title: string;
    artistName: string;
    purchaseUrl?: string;
    state: string;
    settings: { screenLimit: number; maxWaves: number };
    revision: number;
  };
  round: null | {
    id: string;
    sourceTitle: string;
    state: string;
    openedAt: string;
    deadlineAt: string;
    remainingMs?: number;
    pauseReason?: string;
    revision: number;
    waves: Wave[];
  };
  current: null | {
    id: string;
    title: string;
    audio_url: string;
    duration_seconds: number;
  };
  releases: Release[];
  jobs: { id: string; round_id: string; state: string; reason: string }[];
  people: number;
  joined: boolean;
  isOperator: boolean;
  queue?: any[];
};
