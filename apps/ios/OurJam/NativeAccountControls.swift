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
    @Binding var issuedKey: String
    @Binding var disclosureEpoch: UUID
    @State private var status: AccountStatus?
    @State private var following: FollowStatus?
    @State private var error = ""
    @State private var confirmCreate = false
    @State private var confirmDisable = false

    private func load() async {
        guard let api = model.api else { return }
        do {
            let account: AccountStatus = try await api.request("/account")
            guard model.api === api, model.connected, !Task.isCancelled else { return }
            status = account
            if let artist = model.state?.event.artistId {
                let value: FollowStatus = try await api.request("/artists/" + artist + "/follow")
                guard model.api === api, model.connected, !Task.isCancelled else { return }
                following = value
            }
        } catch { self.error = error.localizedDescription }
    }
    private func createKey() async {
        guard let api = model.api, !model.busy else { return }
        model.busy = true; error = ""; issuedKey = ""
        let epoch = disclosureEpoch
        let event = model.state?.event.id
        defer { model.busy = false }
        do {
            let result: RecoveryKey = try await api.request("/account/recovery-key", method: "POST", body: [:])
            guard result.key.range(of: "^ojr_[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw APIError(status: 0, code: "recovery", message: "The server returned an invalid recovery key.")
            }
            // Refresh the form before presenting. The screen-level host owns the
            // disclosure; lazy row recycling must not destroy its presentation.
            await load()
            guard model.api === api, model.connected, model.state?.event.id == event else { return }
            if scene == .active && disclosureEpoch == epoch && !Task.isCancelled { issuedKey = result.key }
            else { error = "A recovery key was created while this view was inactive. Create a replacement and save it before leaving." }
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
