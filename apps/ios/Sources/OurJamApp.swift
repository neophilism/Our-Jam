import SwiftUI
import AVKit

private let acid = Color(red: 0.835, green: 0.988, blue: 0.314)
private let panel = Color(red: 0.098, green: 0.102, blue: 0.086)

@main struct OurJamApp: App {
    @StateObject private var session = JamSession()
    var body: some Scene {
        WindowGroup {
            AudienceRoot().environmentObject(session).preferredColorScheme(.dark).tint(acid)
        }
    }
}
struct AudienceRoot: View {
    @EnvironmentObject private var session: JamSession
    @Environment(\.scenePhase) private var phase
    @State private var tab = 0
    var body: some View {
        NavigationStack {
            Group {
                if session.connected, let snapshot = session.snapshot {
                    TabView(selection: $tab) {
                        LiveRoom(snapshot: snapshot).tabItem { Label("Live", systemImage: "waveform") }.tag(0)
                        ReleaseRoom(snapshot: snapshot).tabItem { Label("Tracks", systemImage: "music.note.list") }.tag(1)
                        ProfileRoom().tabItem { Label("You", systemImage: "person.crop.circle") }.tag(2)
                    }
                    .navigationTitle(snapshot.event.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("Refresh") { Task { await session.refresh() } }.disabled(session.busy) } }
                } else {
                    ConnectRoom().navigationTitle("our jam")
                }
            }
            .safeAreaInset(edge: .top) {
                if !session.error.isEmpty {
                    HStack(alignment: .top) {
                        Image(systemName: "exclamationmark.triangle")
                        Text(session.error).font(.footnote).textSelection(.enabled)
                        Spacer(minLength: 2)
                        Button { session.error = "" } label: { Image(systemName: "xmark.circle") }.accessibilityLabel("Dismiss error")
                    }.padding(12).background(Color.orange.opacity(0.2)).accessibilityElement(children: .combine)
                }
            }
        }
        .task { await session.poll() }
        .onChange(of: phase) { session.sceneActive($0 == .active) }
    }
}
private struct ConnectRoom: View {
    @EnvironmentObject var session: JamSession
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Label("MUSIC MADE TOGETHER", systemImage: "waveform").font(.caption.bold()).foregroundStyle(acid)
                Text("Your sound.\nOur next track.").font(.system(size: 43, weight: .bold, design: .rounded))
                Text("Connect to the real Our Jam server. Nothing is seeded, and joining does not start phone-speaker playback.").foregroundStyle(.secondary)
                VStack(alignment: .leading) {
                    Text("Server address").font(.caption.bold())
                    TextField("https://your-our-jam-server", text: $session.originText).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).accessibilityIdentifier("serverOrigin")
                    Text("Event code or event link").font(.caption.bold()).padding(.top, 12)
                    TextField("Event code", text: $session.roomText).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).accessibilityIdentifier("eventCode")
                }
                Button { Task { await session.connect() } } label: {
                    HStack { if session.busy { ProgressView() }; Text(session.busy ? "Connecting" : "Open the room").bold(); Spacer(); Image(systemName: "arrow.up.right") }
                }.buttonStyle(.borderedProminent).controlSize(.large).foregroundStyle(.black).disabled(session.busy || session.originText.isEmpty || session.roomText.isEmpty).accessibilityIdentifier("connectRoom")
                Text("Native iOS rehearsal client\nSame live API and public-screen event. This is not a simulated audience or an App Store release.").font(.footnote).foregroundStyle(.secondary)
            }.padding(24)
        }
    }
}
private struct LiveRoom: View {
    @EnvironmentObject var session: JamSession
    let snapshot: EventSnapshot
    @State private var phrase = ""
    @State private var code = ""
    @State private var search = ""
    private var waves: [Wave] { snapshot.round?.waves ?? [] }
    private var matching: [Wave] { waves.filter { search.isEmpty || $0.text.localizedCaseInsensitiveContains(search) } }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack { Text(snapshot.event.artistName).font(.headline); Spacer(); Text("\(snapshot.people) joined").font(.caption).foregroundStyle(.secondary) }
                VStack(alignment: .leading, spacing: 8) {
                    Text(!session.fresh ? "RECONNECTING - VOTING PAUSED HERE" : snapshot.round?.state == "paused" ? "SHOW PAUSED" : session.votingOpen ? "\(session.remaining)s TO SHAPE THIS TRACK" : "WAITING FOR THE NEXT ROUND").font(.caption.bold()).foregroundStyle(acid)
                    Text(snapshot.round?.sourceTitle ?? "The artist has not opened a round.").font(.title2.bold())
                }.card()
                SoundField(waves: Array(waves.prefix(6))).frame(height: 210).accessibilityHidden(true)
                if !snapshot.canContribute {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(snapshot.joined ? "You are listening" : "Join this room").font(.headline)
                        if snapshot.admission.mode == "room_code" {
                            Text("Ask the artist for the voting code. Listening remains free.").font(.footnote).foregroundStyle(.secondary)
                            SecureField("Voting room code", text: $code).textInputAutocapitalization(.characters).textFieldStyle(.roundedBorder).accessibilityIdentifier("admissionCode")
                            Button("Unlock voting") { Task { await session.join(roomCode: code) } }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(code.isEmpty || session.busy || !session.fresh)
                            if !snapshot.joined { Button("Join as a listener") { Task { await session.join(roomCode: "") } }.disabled(session.busy || !session.fresh) }
                        } else {
                            Button("Join and contribute") { Task { await session.join(roomCode: "") } }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(session.busy || !session.fresh)
                        }
                        Text("\(snapshot.admission.contributors) / \(snapshot.admission.limit) contributor places").font(.caption).foregroundStyle(.secondary)
                    }.card()
                } else {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("\(max(0, 5 - snapshot.usedPoints)) of 5 points left").font(.title2.bold())
                        Text("One Sound Wave of your own uses one point. Move your points until the track ends.").font(.footnote).foregroundStyle(.secondary)
                        TextField("Smoky trumpet? Drum and bass?", text: $phrase).textFieldStyle(.roundedBorder).disabled(!session.votingOpen).accessibilityIdentifier("soundWaveText")
                        HStack { Text("\(phrase.count)/48").font(.caption).foregroundStyle(.secondary); Spacer()
                            Button("Make a Sound Wave") { Task { if await session.contribute(phrase) { phrase = "" } } }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(!session.votingOpen || phrase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || phrase.count > 48 || snapshot.usedPoints >= 5).accessibilityIdentifier("submitSoundWave") }
                    }.card()
                }
                TextField("Find a Sound Wave", text: $search).textFieldStyle(.roundedBorder)
                LazyVStack(spacing: 10) {
                    ForEach(matching) { wave in
                        VStack(alignment: .leading, spacing: 9) {
                            Text(wave.own ? "YOUR SOUND WAVE" : wave.name.uppercased()).font(.caption2.bold()).foregroundStyle(acid)
                            Text(wave.text).font(.headline)
                            HStack {
                                Text("\(wave.votes) points / \(wave.supporters) supporters").font(.caption).foregroundStyle(.secondary)
                                Spacer()
                                Button { Task { await session.vote(wave, delta: -1) } } label: { Image(systemName: "minus").frame(width: 30, height: 30) }.buttonStyle(.bordered).disabled(!session.votingOpen || wave.mine == 0).accessibilityLabel("Remove one point from " + wave.text)
                                Text("\(wave.mine)").monospacedDigit().accessibilityLabel("\(wave.mine) of your points")
                                Button { Task { await session.vote(wave, delta: 1) } } label: { Image(systemName: "plus").frame(width: 30, height: 30) }.buttonStyle(.bordered).disabled(!session.votingOpen || snapshot.usedPoints >= 5).accessibilityLabel("Add one point to " + wave.text)
                            }
                        }.card()
                    }
                }
                if waves.isEmpty { Text("Your room has no Sound Waves yet. Only real submissions appear here and on the venue screen.").foregroundStyle(.secondary) }
                ForEach(snapshot.jobs.suffix(4)) { job in Text(job.explanation).font(.footnote).card().accessibilityIdentifier("generationStatus") }
                if let stage = session.stageURL { Link("Open the actual venue screen", destination: stage).font(.footnote) }
            }.padding(18)
        }.refreshable { await session.refresh() }
    }
}
private struct SoundField: View {
    let waves: [Wave]
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                RoundedRectangle(cornerRadius: 22).fill(panel)
                if waves.isEmpty { Image(systemName: "waveform").font(.system(size: 64, weight: .ultraLight)).foregroundStyle(acid.opacity(0.3)) }
                ForEach(Array(waves.enumerated()), id: \.element.id) { index, wave in
                    let width = min(120.0, max(72.0, geometry.size.width / 3 - 10 + sqrt(Double(max(0, wave.votes))) * 2))
                    VStack(spacing: 4) {
                        Text(wave.text).font(.caption.bold()).lineLimit(3).multilineTextAlignment(.center)
                        Text("\(wave.votes)").font(.caption2.monospacedDigit())
                    }.padding(10).frame(width: width, height: 90)
                        .background(Capsule().fill(LinearGradient(colors: [acid.opacity(0.35), Color.teal.opacity(0.25), panel], startPoint: .topLeading, endPoint: .bottomTrailing)))
                        .overlay(Capsule().stroke(acid.opacity(0.45), lineWidth: 1))
                        .position(x: geometry.size.width * (CGFloat(index % 3) + 0.5) / 3, y: index < 3 ? 57 : 155)
                }
            }
        }
    }
}
private struct ReleaseRoom: View {
    @EnvironmentObject var session: JamSession
    @Environment(\.scenePhase) private var phase
    let snapshot: EventSnapshot
    @State private var player: AVPlayer?
    @State private var selected: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Made by this room").font(.title.bold())
                Text("Listening is opt-in. Use headphones alongside the live show.").foregroundStyle(.secondary)
                if let player { VideoPlayer(player: player).frame(height: 90).accessibilityLabel("Crowd track audio player") }
                ForEach(snapshot.releases) { release in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(release.title).font(.headline)
                        Text("\(release.likes) likes / \(release.plays) listens").font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Button(selected == release.id ? "Stop listening" : "Listen") {
                                do {
                                    player?.pause()
                                    if selected == release.id { selected = nil; player = nil }
                                    else if let origin = session.origin {
                                        let url = try origin.mediaURL(release.audio_url)
                                        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
                                        try AVAudioSession.sharedInstance().setActive(true)
                                        player = AVPlayer(url: url)
                                        selected = release.id
                                        player?.play()
                                    }
                                } catch { session.error = error.localizedDescription }
                            }.buttonStyle(.bordered)
                            if let origin = session.origin, let url = try? origin.mediaURL(release.download_url) { Link("Download", destination: url).buttonStyle(.bordered) }
                        }
                    }.card()
                }
                if snapshot.releases.isEmpty { Text("No published tracks yet. A blocked generation does not become a pretend song.").foregroundStyle(.secondary) }
                ForEach(snapshot.jobs) { job in Text(job.explanation).font(.footnote).card() }
                Text("Native listening analytics, reactions and comment moderation remain in the full web client during this rehearsal increment.").font(.caption).foregroundStyle(.secondary)
            }.padding(18)
        }
        .onDisappear { player?.pause() }
        .onChange(of: phase) { if $0 != .active { player?.pause() } }
        .onChange(of: snapshot.releases.map(\.id)) { ids in if let selected, !ids.contains(selected) { player?.pause(); player = nil; self.selected = nil } }
    }
}
private struct ProfileRoom: View {
    @EnvironmentObject var session: JamSession
    var body: some View {
        Form {
            Section("Your name and privacy") {
                TextField("Display name", text: $session.profileName)
                Toggle("Appear as Anonymous", isOn: $session.anonymous)
                Button("Save profile") { Task { await session.saveProfile() } }.disabled(session.busy || !session.fresh)
                Text("Public credits follow your anonymity preference. The native guest session is kept in this device's Keychain, scoped to this server.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Real show windows") {
                if let stage = session.stageURL { Link("Public venue screen", destination: stage) }
                if let performer = session.performerURL { Link("Performer console (separate sign-in)", destination: performer) }
                Text("Open the public-screen URL on your Mac in its own browser window and drag that same window onto the external monitor. The audience app has no performer credentials.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Session") {
                Button("Change room") { session.disconnect() }.disabled(session.busy)
                Button("Sign out and revoke this device", role: .destructive) { Task { await session.signOut() } }.disabled(session.busy)
                Text("Cross-device profile recovery, follows and email preferences remain available through the web account page, not this initial native target.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
private extension View {
    func card() -> some View { padding(15).frame(maxWidth: .infinity, alignment: .leading).background(panel).clipShape(RoundedRectangle(cornerRadius: 14)) }
}
