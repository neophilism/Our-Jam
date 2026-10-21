import Foundation
import SwiftUI

@MainActor final class SessionModel: ObservableObject {
    @Published var origin = UserDefaults.standard.string(forKey: "ourjam.origin") ?? "http://127.0.0.1:4173"
    @Published var eventCode = UserDefaults.standard.string(forKey: "ourjam.event") ?? ""
    @Published var state: EventState?
    @Published var error = ""
    @Published var busy = false
    @Published var connected = false
    @Published var fresh = false
    @Published var profileName = ""
    @Published var anonymous = true
    @Published var clock = Date()
    @Published var accountEpoch = UUID()
    private(set) var api: JamAPI?
    private var generation = 0
    private var refreshing = false
    private var lastSuccess = Date.distantPast
    private var serverAnchor = Date()
    private var deviceAnchor = Date()
    var serverNow: Date { serverAnchor.addingTimeInterval(clock.timeIntervalSince(deviceAnchor)) }
    static func date(_ raw: String) -> Date? {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }
    var remaining: Int { max(0, Int((state?.round.flatMap { Self.date($0.deadlineAt) } ?? .distantPast).timeIntervalSince(serverNow))) }
    var used: Int { state?.round?.waves.reduce(0) { $0 + $1.mine } ?? 0 }
    var sponsorElapsed: Double {
        guard let opening = state?.round?.sponsorBreak else { return 0 }
        return max(0, opening.elapsedMs / 1000 + (opening.paused ? 0 : max(0, clock.timeIntervalSince(deviceAnchor))))
    }
    var sponsorRemaining: Int { max(0, Int(ceil((state?.round?.sponsorBreak?.durationSeconds ?? 0) - sponsorElapsed))) }
    var canVote: Bool { connected && fresh && !busy && state?.canContribute == true && state?.round?.state == "open" && remaining > 0 && sponsorRemaining == 0 }
    var voteLimit: Int { max(1, state?.round?.voteLimit ?? 5) }
    var singleVoteMode: Bool { state?.round?.voteMode == "single" }
    func connect() async {
        guard !busy else { return }; busy = true; error = ""; generation += 1
        do {
            let code = eventCode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard code.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil, (3...60).contains(code.count) else { throw APIError(status: 0, code: "event", message: "Enter the event code shown in the performer console or on the public screen.") }
            let client = try JamAPI(origin: origin)
            try await client.ensureSession()
            let loaded: EventState = try await client.request("/events/" + code)
            api = client; origin = client.origin; eventCode = code; connected = true
            UserDefaults.standard.set(origin, forKey: "ourjam.origin"); UserDefaults.standard.set(code, forKey: "ourjam.event")
            apply(loaded)
            let profile: SessionResponse = try await client.request("/session")
            profileName = profile.profile?.name ?? ""; anonymous = profile.profile?.anonymous ?? true
        } catch { self.error = error.localizedDescription; fresh = false }
        busy = false
    }
    private func apply(_ loaded: EventState) {
        if let old = state, old.event.id == loaded.event.id, old.event.revision > loaded.event.revision { return }
        state = loaded; lastSuccess = Date(); clock = Date(); deviceAnchor = clock
        serverAnchor = Self.date(loaded.serverTime) ?? clock; fresh = true
    }
    func refresh() async {
        guard connected, let api, !refreshing else { return }
        refreshing = true; let fence = generation
        do {
            let loaded: EventState = try await api.request("/events/" + eventCode)
            if fence == generation { apply(loaded) }
        } catch { if fence == generation { fresh = false; self.error = error.localizedDescription } }
        refreshing = false
    }
    func tick() { clock = Date(); if clock.timeIntervalSince(lastSuccess) > 15 { fresh = false } }
    func suspend() { generation += 1; fresh = false }
    func accountChanged(using client: JamAPI) async throws {
        guard api === client, connected else { throw APIError(status: 0, code: "account", message: "Reconnect to this event after signing in.") }
        generation += 1; fresh = false; state = nil; accountEpoch = UUID()
        let fence = generation
        let loaded: EventState = try await client.request("/events/" + eventCode)
        guard fence == generation, api === client else { return }
        apply(loaded)
        let profile: SessionResponse = try await client.request("/session")
        guard fence == generation, api === client else { return }
        profileName = profile.profile?.name ?? ""; anonymous = profile.profile?.anonymous ?? true
    }
    func command(_ path: String, method: String = "POST", body: [String: Any]) async -> Bool {
        guard let api, !busy else { return false }; busy = true; error = ""
        do {
            let _: EmptyResponse = try await api.request(path, method: method, body: body)
            await refresh(); busy = false; return true
        } catch {
            self.error = error.localizedDescription
            await refresh(); busy = false; return false
        }
    }
    func join(roomCode: String) async {
        var body: [String: Any] = [:]
        if !roomCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["roomCode"] = roomCode }
        _ = await command("/events/" + eventCode + "/join", body: body)
    }
    func submit(_ text: String) async -> Bool {
        guard canVote, let round = state?.round else { return false }
        return await command("/rounds/" + round.id + "/waves", body: ["commandId": UUID().uuidString, "expectedRevision": round.revision, "text": text])
    }
    func vote(_ wave: Wave, change: Int) async {
        guard canVote, let round = state?.round else { return }
        var allocations = Dictionary(uniqueKeysWithValues: round.waves.filter { $0.mine > 0 }.map { ($0.id, $0.mine) })
        let value = (allocations[wave.id] ?? 0) + change
        guard (0...voteLimit).contains(value), used + change <= voteLimit else { return }
        guard !singleVoteMode || value <= 1 else { return }
        if value == 0 { allocations.removeValue(forKey: wave.id) } else { allocations[wave.id] = value }
        _ = await command("/rounds/" + round.id + "/allocations", method: "PUT", body: ["commandId": UUID().uuidString, "expectedRevision": round.revision, "allocations": allocations])
    }
    func saveProfile() async { _ = await command("/profile", method: "PATCH", body: ["name": profileName.isEmpty ? "Anonymous" : profileName, "anonymous": anonymous]) }
    func disconnect() { generation += 1; connected = false; fresh = false; state = nil; api = nil; error = "" }
    func signOut() async {
        guard !busy else { return }; busy = true
        do { try await api?.signOut(); disconnect() } catch { self.error = error.localizedDescription }
        busy = false
    }
}
