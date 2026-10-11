import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Text, TextInput, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { Release } from "../../../packages/contracts/src/public";
import { api, mediaUrl } from "./api";
import { Button, colors, styles } from "./ui";

export function Player({
  release,
  onFeedback,
  refresh,
}: {
  release: Release;
  onFeedback: (release: Release) => void;
  refresh: () => Promise<void>;
}) {
  const player = useAudioPlayer(mediaUrl(release.audio_url), {
    updateInterval: 500,
  });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState(""),
    [body, setBody] = useState(""),
    [comments, setComments] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  const intervals = useRef<[number, number][]>([]),
    last = useRef<{ position: number; at: number } | null>(null),
    inFlight = useRef(false),
    eligible = useRef(false),
    rated = useRef(Boolean(release.reaction)),
    mounted = useRef(true);
  const feedback = useRef(onFeedback);
  feedback.current = onFeedback;
  useEffect(() => {
    if (status.error) setError(status.error);
  }, [status.error]);
  async function flush() {
    if (inFlight.current || !intervals.current.length) return;
    inFlight.current = true;
    const sent = intervals.current.map(([a, b]) => [a, b] as [number, number]);
    try {
      const result = await api(`/releases/${release.id}/listen`, "POST", {
        intervals: sent,
      });
      // Keep at-least-once interval delivery: the server merges overlaps.
      eligible.current = Boolean(result.feedbackEligible);
      if (!mounted.current && eligible.current && !rated.current)
        feedback.current(release);
    } catch {
      /* Retry unchanged intervals on the next foreground flush. */
    } finally {
      inFlight.current = false;
    }
  }
  async function loadComments() {
    try {
      const value = await api(`/releases/${release.id}/comments`);
      if (mounted.current) setComments(value.comments);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (!status.playing || !status.isLoaded || status.isBuffering) {
      last.current = null;
      return;
    }
    const now = performance.now(),
      position = status.currentTime,
      old = last.current;
    if (old) {
      const delta = position - old.position;
      if (delta > 0 && delta <= 2 && delta <= (now - old.at) / 1000 + 0.4) {
        const tail = intervals.current.at(-1);
        if (tail && Math.abs(tail[1] - old.position) < 0.15) tail[1] = position;
        else if (intervals.current.length < 120)
          intervals.current.push([old.position, position]);
      }
    }
    last.current = { position, at: now };
  }, [status.currentTime, status.playing, status.isLoaded, status.isBuffering]);
  useEffect(() => {
    mounted.current = true;
    void loadComments();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        void flush();
        void loadComments();
      }
    }, 10000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        player.pause();
        last.current = null;
        void flush();
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      sub.remove();
      void flush();
      if (eligible.current && !rated.current) feedback.current(release);
    };
  }, [release.id, player]);
  useEffect(() => {
    if (status.didJustFinish)
      void flush().then(() => {
        if (eligible.current && !rated.current) feedback.current(release);
      });
  }, [status.didJustFinish]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.label}>MADE BY THIS ROOM</Text>
      <Text style={styles.heading}>{release.title}</Text>
      <Text style={styles.muted}>
        Use headphones to hear this alongside the show.
      </Text>
      <Button
        title={status.playing ? "Pause" : "Play track"}
        disabled={!status.isLoaded}
        onPress={() => {
          try {
            if (status.playing) player.pause();
            else {
              if (status.didJustFinish) void player.seekTo(0);
              player.play();
            }
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <Text style={styles.muted}>
        {status.isLoaded
          ? `${Math.floor(status.currentTime)} / ${Math.floor(status.duration)} seconds`
          : "Loading audio…"}
      </Text>
      <View style={styles.row}>
        <Button
          title="Love it"
          disabled={busy}
          onPress={() =>
            void action(async () => {
              await api(`/releases/${release.id}/reaction`, "PUT", {
                value: 1,
              });
              rated.current = true;
              await refresh();
            })
          }
        />
        <Button
          title="Not my sound"
          secondary
          disabled={busy}
          onPress={() =>
            void action(async () => {
              await api(`/releases/${release.id}/reaction`, "PUT", {
                value: -1,
              });
              rated.current = true;
              await refresh();
            })
          }
        />
      </View>
      <Button
        title="Open free download"
        secondary
        onPress={() =>
          void action(async () => {
            await Linking.openURL(mediaUrl(release.download_url));
          })
        }
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel="Comment on this track"
        placeholder="What did you hear in it?"
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={body}
        maxLength={500}
        multiline
        onChangeText={setBody}
      />
      <Button
        title="Send comment"
        disabled={busy || !body.trim()}
        onPress={() =>
          void action(async () => {
            await api(`/releases/${release.id}/comments`, "POST", { body });
            setBody("");
            await loadComments();
          })
        }
      />
      {comments.map((c) => (
        <View key={c.id} style={{ gap: 6 }}>
          <Text style={[styles.text, { fontWeight: "700" }]}>{c.name}</Text>
          <Text style={styles.text}>{c.body}</Text>
          <Button
            title="Report comment"
            secondary
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await api(`/comments/${c.id}/report`, "POST", {
                  reason: "Flagged from the native listener",
                });
                setError("Report sent to the artist.");
              })
            }
          />
        </View>
      ))}
    </View>
  );
}
