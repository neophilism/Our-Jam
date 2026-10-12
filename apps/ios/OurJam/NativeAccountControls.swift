import SwiftUI

private struct AccountStatus: Decodable {
    let recoveryEnabled: Bool
    let sessions: Int
}
private struct RecoveryKey: Decodable { let key: String }
private struct FollowStatus: Decodable {
    let following: Bool
    let followers: Int?
}

/// Uses the same real recovery/follow APIs as the browser. A recovery key is
/// displayed transiently, never saved to preferences, source, logs or a URL.
struct NativeAccountControls: View {
    @ObservedObject var model: SessionModel
    @Environment(\.scenePhase) private var scene
    @State private var status: AccountStatus?
    @State private var following: FollowStatus?
    @State private var issuedKey = ""
    @State private var error = ""
    @State private var confirmCreate = false
    @State private var confirmDisable = false

    private func load() async {
        guard let api = model.api else { return }
        do {
            let account: AccountStatus = try await api.request("/account")
            status = account
            if let artist = model.state?.event.artistId {
                let value: FollowStatus = try await api.request("/artists/" + artist + "/follow")
                following = value
            }
        } catch { self.error = error.localizedDescription }
    }
    private func createKey() async {
        guard let api = model.api, !model.busy else { return }
        model.busy = true; error = ""; issuedKey = ""
        defer { model.busy = false }
        do {
            let result: RecoveryKey = try await api.request("/account/recovery-key", method: "POST", body: [:])
            guard result.key.range(of: "^ojr_[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw APIError(status: 0, code: "recovery", message: "The server returned an invalid recovery key.")
            }
            if scene == .active { issuedKey = result.key }
            else { error = "A recovery key was created while this view was inactive. Create a replacement and save it before leaving." }
            await load()
        } catch {
            self.error = "The recovery-key request was not automatically repeated. " + error.localizedDescription
        }
    }
    private func disableKey() async {
        guard let api = model.api, !model.busy else { return }
        model.busy = true; error = ""
        defer { model.busy = false }
        do {
            let _: EmptyResponse = try await api.request("/account/recovery-key", method: "DELETE")
            issuedKey = ""; await load()
        } catch { self.error = error.localizedDescription }
    }
    private func changeFollow() async {
        guard let api = model.api, let artist = model.state?.event.artistId, let following, !model.busy else { return }
        model.busy = true; error = ""
        defer { model.busy = false }
        do {
            let _: FollowStatus = try await api.request("/artists/" + artist + "/follow", method: "PUT", body: ["following": !following.following])
            await load()
        } catch { self.error = error.localizedDescription; await load() }
    }
    var body: some View {
        Section("Keep this profile") {
            Text(status?.recoveryEnabled == true ? "Recovery key enabled" : "Save a recovery key to keep your votes, credits and follows when you change devices.")
            Button(status?.recoveryEnabled == true ? "Replace recovery key" : "Create recovery key") { confirmCreate = true }
                .disabled(model.busy || status == nil).accessibilityIdentifier("createRecoveryKey")
            if status?.recoveryEnabled == true {
                Button("Disable recovery key", role: .destructive) { confirmDisable = true }.disabled(model.busy)
            }
            Text("A recovery key grants access to this fan profile. Store it in your password manager. It does not grant performer controls. Restoring it signs out the profile's other sessions.").font(.footnote)
            Divider()
            Text("Follow the artist").font(.headline)
            if let following {
                Button(following.following ? "Unfollow artist" : "Follow artist") { Task { await changeFollow() } }.disabled(model.busy).accessibilityIdentifier("followArtist")
                if let count = following.followers { Text("\(count) followers").font(.caption) }
            }
            Text("Following does not subscribe you to email. Your follows stay with your recoverable profile.").font(.footnote)
            if !error.isEmpty { Text(error).foregroundStyle(.orange) }
        }
        .task { await load() }
        .confirmationDialog("Create a new recovery key? Any previous key will stop working.", isPresented: $confirmCreate, titleVisibility: .visible) {
            Button("Create and show key") { Task { await createKey() } }
        }
        .confirmationDialog("Disable recovery? Saved copies of your key will stop working.", isPresented: $confirmDisable, titleVisibility: .visible) {
            Button("Disable key", role: .destructive) { Task { await disableKey() } }
        }
        .sheet(isPresented: Binding(get: { !issuedKey.isEmpty }, set: { if !$0 { issuedKey = "" } })) {
            VStack(alignment: .leading, spacing: 22) {
                Text("Save your recovery key").font(.title.bold())
                Text("Save this in your password manager before dismissing. We will not show this key again.")
                Text(issuedKey).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).privacySensitive().accessibilityIdentifier("newRecoveryKey")
                Button("I saved it") { issuedKey = "" }.buttonStyle(.borderedProminent)
            }.padding(24)
        }
        .onChange(of: scene) { _, value in if value != .active { issuedKey = "" } }
        .onDisappear { issuedKey = "" }
    }
}

struct NativeRecoveryConnect: View {
    @ObservedObject var model: SessionModel
    @State private var key = ""
    @State private var confirm = false
    private func restore() async {
        guard !model.busy else { return }
        model.busy = true; model.error = ""
        do {
            let origin = try await JamAPI.restoreSavedProfile(origin: model.origin, key: key)
            key = ""; model.origin = origin
            model.busy = false
            await model.connect()
        } catch {
            model.error = error.localizedDescription
            model.busy = false
        }
    }
    var body: some View {
        Section("Restore a saved profile") {
            SecureField("Recovery key", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(model.busy).accessibilityIdentifier("restoreRecoveryKey")
            Button("Restore profile") { confirm = true }.disabled(model.busy || key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("restoreProfile")
            Text("Use only your trusted Our Jam server above. Recovery replaces this device's guest credential and signs out other sessions for the recovered profile.").font(.footnote)
        }
        .confirmationDialog("Restore this profile and revoke its other sessions?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Restore saved profile") { Task { await restore() } }
        }
        .onDisappear { key = "" }
    }
}

private extension JamAPI {
    static func restoreSavedProfile(origin: String, key supplied: String) async throws -> String {
        let key = supplied.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.range(of: "^ojr_[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw APIError(status: 0, code: "recovery", message: "Paste your complete saved recovery key.")
        }
        let client = try JamAPI(origin: origin)
        // The new client has no bearer credential and never reads another origin's Keychain item.
        let restored: TokenResponse = try await client.request("/account/recover", method: "POST", body: ["key": key, "channel": "mobile"])
        guard restored.token.range(of: "^ojm_[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw APIError(status: 0, code: "token", message: "The server returned an invalid device credential.")
        }
        do { try GuestKeychain.write(client.origin, restored.token) }
        catch {
            // The reusable recovery key permits an explicit retry, revoking this unretained token.
            throw APIError(status: 0, code: "keychain", message: "Recovery reached the server, but the device could not save its credential. Unlock the device and explicitly retry with the same saved key.")
        }
        return client.origin
    }
}
