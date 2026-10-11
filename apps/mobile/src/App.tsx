import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import * as Crypto from "expo-crypto";
import type {
  EventState,
  Release,
  Wave,
} from "../../../packages/contracts/src/public";
import { api, ensureSession, origin, resetSession, roomCode } from "./api";
import { Button, colors, styles, WaveScene } from "./ui";
import { Player } from "./Player";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <Audience />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Audience() {
  const [slug, setSlug] = useState(""),
    [code, setCode] = useState(""),
    [data, setData] = useState<EventState | null>(null),
    [error, setError] = useState(""),
    [fresh, setFresh] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("waves"),
    [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [now, setNow] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [pending, setPending] = useState<Release | null>(null),
    [name, setName] = useState(""),
    [anonymous, setAnonymous] = useState(true),
    [profile, setProfile] = useState(false);
  const clock = useRef({ server: Date.now(), mono: performance.now() }),
    requestVersion = useRef(0),
    latestSlug = useRef(slug),
    locked = useRef(false),
    releaseCount = useRef<number | null>(null);
  latestSlug.current = slug;
  const [announcement, setAnnouncement] = useState("");
  const refresh = useCallback(async () => {
    if (!slug) return;
    const version = ++requestVersion.current;
    try {
      await ensureSession();
      const next = await api<EventState>(`/events/${slug}`);
      if (latestSlug.current !== slug || version !== requestVersion.current)
        return;
      clock.current = {
        server: new Date(next.serverTime).getTime(),
        mono: performance.now(),
      };
      setNow(clock.current.server);
      setData(next);
      setFresh(true);
      if (
        releaseCount.current !== null &&
        next.releases.length > releaseCount.current
      )
        setAnnouncement("A new crowd track is ready in Our tracks.");
      releaseCount.current = next.releases.length;
    } catch (e) {
      if (latestSlug.current === slug && version === requestVersion.current) {
        setFresh(false);
        setError((e as Error).message);
      }
    }
  }, [slug]);
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "doNotMix",
    }).catch(() =>
      setError("The device audio session could not be configured."),
    );
    function link(value: string) {
      try {
        const next = roomCode(value);
        setSlug(next);
        setCode(next);
        setData(null);
        releaseCount.current = null;
      } catch {}
    }
    void Linking.getInitialURL().then((url) => {
      if (url) link(url);
    });
    const sub = Linking.addEventListener("url", (e) => link(e.url));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setFresh(false);
    void refresh();
    const poll = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 5000);
    const tick = setInterval(() => {
      const delta = performance.now() - clock.current.mono;
      setNow(clock.current.server + delta);
      if (delta > 15000) setFresh(false);
    }, 500);
    const sub = AppState.addEventListener("change", (state) => {
      setFresh(false);
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      sub.remove();
    };
  }, [refresh]);
  async function action(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await ensureSession();
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const round = data?.round,
    waves = round?.waves ?? [],
    used = waves.reduce((n, w) => n + w.mine, 0);
  const matching = waves.filter(
    (w) =>
      !search ||
      w.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const visibleIds = new Set(matching.slice(0, 60).map((w) => w.id));
  if (!search) for (const w of waves) if (w.mine || w.own) visibleIds.add(w.id);
  const visibleWaves = waves.filter((w) => visibleIds.has(w.id));
  const open =
    fresh &&
    round?.state === "open" &&
    now < new Date(round.deadlineAt).getTime();
  async function vote(wave: Wave, delta: number) {
    if (!round || !open) return;
    const allocations = Object.fromEntries(
      waves.filter((w) => w.mine).map((w) => [w.id, w.mine]),
    );
    allocations[wave.id] = (allocations[wave.id] ?? 0) + delta;
    if (!allocations[wave.id]) delete allocations[wave.id];
    await api(`/rounds/${round.id}/allocations`, "PUT", {
      commandId: Crypto.randomUUID(),
      expectedRevision: round.revision,
      allocations,
    });
  }
  const remaining = round
    ? Math.max(
        0,
        Math.ceil(
          (round.state === "paused"
            ? (round.remainingMs ?? 0)
            : new Date(round.deadlineAt).getTime() - now) / 1000,
        ),
      )
    : 0;
  const active = data?.releases.find((r) => r.id === selected);
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={busy}
          onRefresh={() => void refresh()}
          tintColor={colors.acid}
        />
      }
    >
      <View style={styles.row}>
        <Text style={styles.label}>OUR JAM / MUSIC MADE TOGETHER</Text>
      </View>
      {!data ? (
        <>
          <Text style={styles.title}>Your sound. Our next track.</Text>
          <Text style={styles.text}>
            Join the live room, contribute a Sound Wave, and help shape what
            everyone hears next.
          </Text>
          <TextInput
            accessibilityLabel="Event code or link"
            placeholder="Event code or Our Jam link"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
          <Button
            title="Open the room"
            disabled={!origin || busy}
            onPress={() => {
              try {
                const next = roomCode(code);
                setError("");
                if (next === slug) void refresh();
                else {
                  setSlug(next);
                  releaseCount.current = null;
                }
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          {!origin && (
            <Text style={styles.muted}>
              This development build needs EXPO_PUBLIC_API_ORIGIN set to its
              deployed HTTPS address.
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>{data.event.title}</Text>
          <Text style={styles.muted}>
            {data.event.artistName} · {data.people} people joined
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>
              {!fresh
                ? "RECONNECTING · VOTING PAUSED HERE"
                : round?.state === "paused"
                  ? "VOTING PAUSED"
                  : open
                    ? `${remaining}s TO SHAPE THIS TRACK`
                    : "WAITING FOR THE NEXT WAVE"}
            </Text>
          </View>
          <Text style={styles.text}>
            {round?.sourceTitle ?? "The room is warming up."}
          </Text>
          <View style={styles.row}>
            {[
              ["waves", "Sound Waves"],
              ["tracks", `Our tracks (${data.releases.length})`],
              ["room", "The room"],
            ].map(([key, title]) => (
              <Button
                key={key}
                title={title}
                secondary={tab !== key}
                onPress={() => {
                  setTab(key);
                  if (key === "tracks") setAnnouncement("");
                }}
              />
            ))}
          </View>
          {announcement ? (
            <Button
              title={announcement}
              onPress={() => {
                setTab("tracks");
                setAnnouncement("");
              }}
            />
          ) : null}
          {tab === "waves" && (
            <>
              <WaveScene waves={waves} />
              {!data.joined ? (
                <Button
                  title="I'm in. Let's make music"
                  disabled={busy || !fresh}
                  onPress={() =>
                    void action(async () => {
                      await api(`/events/${slug}/join`, "POST", {});
                    })
                  }
                />
              ) : (
                <>
                  <View style={styles.card}>
                    <Text style={styles.heading}>
                      {5 - used} of 5 points left
                    </Text>
                    <Text style={styles.muted}>
                      Move your points until the track ends. One Sound Wave of
                      your own uses one point.
                    </Text>
                    <TextInput
                      accessibilityLabel="What would you mix this with?"
                      placeholder="Smoky trumpet? Drum and bass?"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      maxLength={48}
                      value={text}
                      onChangeText={setText}
                      editable={Boolean(open && !busy)}
                    />
                    <Button
                      title="Contribute Sound Wave"
                      disabled={!open || busy || !text.trim() || used >= 5}
                      onPress={() =>
                        void action(async () => {
                          await api(`/rounds/${round!.id}/waves`, "POST", {
                            commandId: Crypto.randomUUID(),
                            expectedRevision: round!.revision,
                            text,
                          });
                          setText("");
                        })
                      }
                    />
                    {used === 5 && (
                      <Text style={styles.muted}>
                        Remove one point below to contribute a new Sound Wave.
                      </Text>
                    )}
                  </View>
                  <TextInput
                    accessibilityLabel="Find a Sound Wave"
                    placeholder="Find a Sound Wave"
                    placeholderTextColor={colors.muted}
                    value={search}
                    onChangeText={setSearch}
                    style={styles.input}
                  />
                  {matching.length > 60 && (
                    <Text style={styles.muted}>
                      Showing leading waves and your points. Search to find any
                      idea in the room.
                    </Text>
                  )}
                  {visibleWaves.map((w) => (
                    <View key={w.id} style={styles.card}>
                      <Text style={styles.label}>
                        {waves.findIndex((item) => item.id === w.id) + 1} /{" "}
                        {w.own ? "YOUR SOUND WAVE" : w.name.toUpperCase()}
                      </Text>
                      <Text style={styles.heading}>{w.text}</Text>
                      <Text style={styles.muted}>
                        {w.votes} points · {w.supporters} supporters
                      </Text>
                      <View style={styles.row}>
                        <Button
                          title={`− ${w.text}`}
                          secondary
                          disabled={!open || busy || !w.mine}
                          onPress={() => void action(() => vote(w, -1))}
                        />
                        <Text style={styles.text}>{w.mine} yours</Text>
                        <Button
                          title={`+ ${w.text}`}
                          disabled={!open || busy || used >= 5}
                          onPress={() => void action(() => vote(w, 1))}
                        />
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          {tab === "tracks" && (
            <>
              {active && (
                <Player
                  key={active.id}
                  release={active}
                  onFeedback={setPending}
                  refresh={refresh}
                />
              )}
              {data.releases.map((r) => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.heading}>{r.title}</Text>
                  <Text style={styles.muted}>
                    {r.likes} likes · {r.plays} listens
                  </Text>
                  <Button
                    title={selected === r.id ? "Close player" : "Listen"}
                    onPress={() => setSelected(selected === r.id ? null : r.id)}
                  />
                </View>
              ))}
              {!data.releases.length && (
                <Text style={styles.muted}>
                  The room's released tracks will appear here together.
                </Text>
              )}
            </>
          )}
          {tab === "room" && (
            <Leaderboard artistId={data.event.artistId} slug={slug} />
          )}
          <Button
            title="Your name & privacy"
            secondary
            onPress={() =>
              void action(async () => {
                const s = await api("/session");
                setName(s.profile.name);
                setAnonymous(s.profile.anonymous);
                setProfile(!profile);
              })
            }
          />
          {profile && (
            <View style={styles.card}>
              <TextInput
                accessibilityLabel="Display name"
                value={name}
                onChangeText={setName}
                maxLength={32}
                style={styles.input}
              />
              <View style={styles.row}>
                <Switch
                  accessibilityLabel="Appear as Anonymous"
                  value={anonymous}
                  onValueChange={setAnonymous}
                />
                <Text style={styles.text}>Appear as Anonymous</Text>
              </View>
              <Button
                title="Save profile"
                disabled={busy || !name.trim()}
                onPress={() =>
                  void action(async () => {
                    await api("/profile", "PATCH", { name, anonymous });
                    setProfile(false);
                  })
                }
              />
            </View>
          )}
          <Button
            title="Change room"
            secondary
            onPress={() => {
              setSlug("");
              setData(null);
              setSelected(null);
              setPending(null);
              setProfile(false);
              releaseCount.current = null;
            }}
          />
        </>
      )}
      {pending && !(tab === "tracks" && selected === pending.id) && (
        <View style={styles.card}>
          <Text style={styles.heading}>How did “{pending.title}” feel?</Text>
          <Button
            title="Love it"
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await api(`/releases/${pending.id}/reaction`, "PUT", {
                  value: 1,
                });
                setPending(null);
              })
            }
          />
          <Button
            title="Not my sound"
            secondary
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await api(`/releases/${pending.id}/reaction`, "PUT", {
                  value: -1,
                });
                setPending(null);
              })
            }
          />
          <Button title="Dismiss" secondary onPress={() => setPending(null)} />
        </View>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.text}>
          {error}
        </Text>
      ) : null}
      <Button
        title="Reset this device session"
        secondary
        disabled={busy}
        onPress={() =>
          Alert.alert(
            "Start with a new guest identity?",
            "Existing contributions remain, but this device will lose access to their profile. Change your name to Anonymous first if you want it hidden.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: () => {
                  setBusy(true);
                  void resetSession()
                    .then(() => {
                      setData(null);
                      setSlug("");
                      setSelected(null);
                      setError("");
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                },
              },
            ],
          )
        }
      />
    </ScrollView>
  );
}
function Leaderboard({ artistId, slug }: { artistId: string; slug: string }) {
  const [period, setPeriod] = useState("all"),
    [entries, setEntries] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api(
      `/artists/${encodeURIComponent(artistId)}/leaderboard?event=${encodeURIComponent(slug)}&period=${period}&metric=included`,
    )
      .then((value) => {
        if (active) {
          setEntries(value.entries);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [artistId, slug, period]);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>The people behind the sound.</Text>
      <Text style={styles.muted}>
        Sound Waves included in this event's released music.
      </Text>
      <View style={styles.row}>
        {[
          ["all", "All time"],
          ["week", "This week"],
          ["month", "This month"],
        ].map(([key, label]) => (
          <Button
            key={key}
            title={label}
            secondary={period !== key}
            onPress={() => setPeriod(key)}
          />
        ))}
      </View>
      {entries.map((e, i) => (
        <View key={e.id}>
          <Text style={styles.text}>
            {i + 1}. {e.name}
          </Text>
          <Text style={styles.muted}>
            {e.included} waves included · {e.support} points from others
          </Text>
        </View>
      ))}
      {!entries.length && (
        <Text style={styles.muted}>
          Credits arrive with the first released track.
        </Text>
      )}
      {error ? <Text style={styles.text}>{error}</Text> : null}
    </View>
  );
}
