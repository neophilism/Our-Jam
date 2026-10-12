import SwiftUI
import AVKit

private let lime = Color(red: 0.84, green: 0.99, blue: 0.31)
@main struct OurJamApp: App {
    @StateObject private var model = SessionModel()
    @Environment(\.scenePhase) private var scene
    var body: some Scene {
        WindowGroup {
            Group {
                if model.connected { SessionView(model: model) }
                else { ConnectView(model: model) }
            }
            .tint(lime).preferredColorScheme(.dark)
            .onChange(of: scene) { _, value in
                if value == .active { Task { await model.refresh() } } else { model.suspend() }
            }
        }
    }
}
struct ConnectView: View {
    @ObservedObject var model: SessionModel
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(systemName: "waveform").font(.system(size: 42)).foregroundStyle(lime)
                    Text("Your sound. Our next track.").font(.largeTitle.bold())
                    Text("Connect to your actual Our Jam server and enter the event code. No demonstration data is created.")
                }
                Section("Connect to a real session") {
                    TextField("Server address", text: $model.origin).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(model.busy).accessibilityIdentifier("serverAddress")
                    TextField("Event code", text: $model.eventCode).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(model.busy).accessibilityIdentifier("eventCode")
                    Button(model.busy ? "Connecting..." : "Open session") { Task { await model.connect() } }.disabled(model.busy).accessibilityIdentifier("connectButton")
                }
                NativeRecoveryConnect(model: model)
                Section { Text("For a simulator and server on this Mac, use http://127.0.0.1:4173. A physical phone needs a reachable HTTPS deployment, not the Mac's loopback address.").font(.footnote) }
            }.scrollDismissesKeyboard(.interactively).navigationTitle("our jam")
            .safeAreaInset(edge: .top) {
                if !model.error.isEmpty {
                    Text(model.error).font(.callout).foregroundStyle(.orange).padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.black).accessibilityIdentifier("connectionError")
                }
            }
        }
    }
}
struct SessionView: View {
    @ObservedObject var model: SessionModel
    @Environment(\.scenePhase) private var scene
    var body: some View {
        TabView {
            LiveView(model: model).tabItem { Label("Live", systemImage: "waveform") }
            TracksView(model: model).tabItem { Label("Tracks", systemImage: "music.note.list") }
            ProfileView(model: model).tabItem { Label("You", systemImage: "person.crop.circle") }
        }
        .task {
            var cycle = 0
            while !Task.isCancelled {
                model.tick()
                if scene == .active && cycle % 3 == 0 { await model.refresh() }
                cycle += 1
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }
}
struct LiveView: View {
    @ObservedObject var model: SessionModel
    @State private var text = ""
    @State private var roomCode = ""
    @FocusState private var waveInputFocused: Bool
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let state = model.state {
                        Text(state.event.artistName.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(lime)
                        Text(state.round?.sourceTitle ?? state.event.title).font(.largeTitle.bold())
                        HStack {
                            Label(model.fresh ? "Connected" : "Refreshing / offline", systemImage: model.fresh ? "wifi" : "wifi.slash")
                            Spacer(); Text("\(state.people) in this session")
                        }.font(.caption)
                        Text(state.round?.state == "paused" ? "Voting paused with playback" : state.round?.state == "open" ? "\(model.remaining / 60):\(String(format: "%02d", model.remaining % 60)) remaining" : state.event.state == "ended" ? "This session has ended" : "Waiting for the performer").font(.title3.monospacedDigit())
                        if !state.canContribute {
                            GroupBox("Join the collaboration") {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("You can listen without voting. Join to submit sound tags and move your five points.")
                                    if state.admission.mode == "room_code" { TextField("Room code", text: $roomCode).textInputAutocapitalization(.characters).autocorrectionDisabled().textFieldStyle(.roundedBorder) }
                                    Button("Join and contribute") { Task { await model.join(roomCode: roomCode) } }.buttonStyle(.borderedProminent).disabled(model.busy).accessibilityIdentifier("joinButton")
                                }
                            }
                        }
                        GroupBox("Your Sound Wave") {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("What would you mix into this sound?")
                                TextField("Instrument, rhythm, mood...", text: $text).textFieldStyle(.roundedBorder).onChange(of: text) { _, value in if value.count > 48 { text = String(value.prefix(48)) } }.focused($waveInputFocused).accessibilityIdentifier("waveText")
                                Button("Contribute Sound Wave") { waveInputFocused = false; Task { if await model.submit(text) { text = "" } } }.buttonStyle(.borderedProminent).disabled(!model.canVote || text.trimmingCharacters(in: .whitespacesAndNewlines).count < 2).accessibilityIdentifier("submitWave")
                                Text("\(5 - model.used) of 5 points available").font(.headline).accessibilityIdentifier("voteBudget")
                            }
                        }
                        Text("The room's sound").font(.title2.bold())
                        if state.round?.waves.isEmpty != false { Text("The first Sound Wave starts with you. Nothing is added automatically.").foregroundStyle(.secondary) }
                        ForEach(state.round?.waves ?? []) { wave in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack { Image(systemName: "waveform.path").foregroundStyle(lime); Text(wave.text).font(.headline); Spacer(); Text("\(wave.votes)").font(.title2.bold()).foregroundStyle(lime) }
                                HStack {
                                    Text(wave.name).font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Button { Task { await model.vote(wave, change: -1) } } label: { Image(systemName: "minus") }.accessibilityLabel("Remove point from " + wave.text).disabled(!model.canVote || wave.mine == 0)
                                    Text("\(wave.mine)").monospacedDigit().frame(minWidth: 25)
                                    Button { Task { await model.vote(wave, change: 1) } } label: { Image(systemName: "plus") }.accessibilityLabel("Support " + wave.text).disabled(!model.canVote || model.used >= 5)
                                }.buttonStyle(.bordered).controlSize(.large)
                            }.padding().background(Color.white.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        if !state.jobs.isEmpty {
                            Text("Generation activity").font(.title2.bold())
                            ForEach(state.jobs.prefix(5)) { job in
                                VStack(alignment: .leading, spacing: 6) { Text(job.state.capitalized).bold(); Text(job.explanation).font(.callout) }.padding().frame(maxWidth: .infinity, alignment: .leading).background(Color.white.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    if !model.error.isEmpty { Text(model.error).foregroundStyle(.orange).accessibilityIdentifier("liveError") }
                }.padding()
            }.scrollDismissesKeyboard(.interactively).refreshable { await model.refresh() }.navigationTitle("our jam").navigationBarTitleDisplayMode(.inline)
        }
    }
}
struct TracksView: View {
    @ObservedObject var model: SessionModel
    @Environment(\.scenePhase) private var scene
    @State private var player: AVPlayer?
    @State private var listeningTitle = ""
    @State private var listeningID: String?
    var body: some View {
        NavigationStack {
            List {
                if let player {
                    Section("Private listening: " + listeningTitle) { VideoPlayer(player: player).frame(height: 160); Button("Stop listening") { player.pause(); self.player = nil; listeningID = nil } }
                }
                if model.state?.releases.isEmpty != false { Text("No crowd tracks have been released yet. Generation errors remain visible in Live; no prerecorded substitute is inserted.") }
                ForEach(model.state?.releases ?? []) { release in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(release.title).font(.headline)
                        Text("\(Int(release.duration_seconds)) seconds | \(release.likes) likes").font(.caption)
                        if let url = model.api?.mediaURL(release.audio_url) {
                            Button("Listen") {
                                player?.pause(); player = AVPlayer(url: url); listeningTitle = release.title; listeningID = release.id; player?.play()
                            }
                        }
                        if let url = model.api?.mediaURL(release.download_url) { Link("Download released track", destination: url) }
                    }.padding(.vertical, 8)
                }
            }.navigationTitle("Crowd tracks").onDisappear { player?.pause() }
            .onChange(of: scene) { _, value in if value != .active { player?.pause() } }
            .onChange(of: model.state?.releases.map(\.id) ?? []) { _, visibleIDs in
                if let listeningID, !visibleIDs.contains(listeningID) {
                    player?.pause(); player = nil; self.listeningID = nil
                }
            }
        }
    }
}
struct ProfileView: View {
    @ObservedObject var model: SessionModel
    @State private var confirmSignOut = false
    @FocusState private var editingName: Bool
    var body: some View {
        NavigationStack {
            Form {
                Section("Your public credit") {
                    TextField("Display name", text: $model.profileName).focused($editingName).submitLabel(.done).onSubmit { editingName = false }.accessibilityIdentifier("profileName").onChange(of: model.profileName) { _, value in if value.count > 32 { model.profileName = String(value.prefix(32)) } }
                    Toggle("Keep my credit anonymous", isOn: $model.anonymous)
                    Button("Save profile") { editingName = false; Task { await model.saveProfile() } }.disabled(model.busy).accessibilityIdentifier("saveProfile")
                }
                NativeAccountControls(model: model)
                Section("Connected event") {
                    Text(model.state?.event.title ?? model.eventCode)
                    Text(model.origin).font(.caption).textSelection(.enabled)
                    Button("Change event or server") { model.disconnect() }.disabled(model.busy)
                    Button("Sign out this device", role: .destructive) { confirmSignOut = true }.disabled(model.busy)
                }
                Section { Text("Your guest credential is stored in this device's Keychain, not in the browser. Signing out removes this device's access. Save a recovery key before discarding a profile you want to keep.").font(.footnote) }
                if !model.error.isEmpty { Text(model.error).foregroundStyle(.orange) }
            }.scrollDismissesKeyboard(.interactively).navigationTitle("Your profile")
            .confirmationDialog("Sign out and remove this device credential?", isPresented: $confirmSignOut, titleVisibility: .visible) { Button("Sign out", role: .destructive) { Task { await model.signOut() } } }
        }
    }
}
