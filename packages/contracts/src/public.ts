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
    artistId: string;
    purchaseUrl?: string;
    state: string;
    settings: {
      screenLimit: number;
      maxWaves: number;
      minimumRoundSeconds: number;
      maxGenerations: number;
      releaseMode?: "boundary" | "immediate" | "review";
    };
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
  jobs: {
    id: string;
    round_id: string;
    state: string;
    reason: string;
    release_held?: boolean;
    release_mode?: string;
    attempts?: number;
    reserved_cents?: number;
    release_id?: string;
    release_title?: string;
    release_hidden?: boolean;
  }[];
  people: number;
  joined: boolean;
  isOperator: boolean;
  queue?: any[];
};
