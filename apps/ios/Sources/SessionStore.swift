import Foundation
import Combine
import Security

private enum NativeKeychain {
    private static func query(_ origin: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.neophilism.ourjam.rehearsal",
         kSecAttrAccount as String: origin]
    }
    static func get(_ origin: String) throws -> String? {
        var q = query(origin)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data, let value = String(data: bytes, encoding: .utf8) else {
            throw JamError.server("The device could not read its secure session. Unlock the device and try again.")
        }
        return value
    }
    static func save(_ value: String, origin: String) throws {
        let q = query(origin)
        let attrs: [String: Any] = [kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updated = SecItemUpdate(q as CFDictionary, attrs as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw JamError.server("Could not update the secure session.") }
        var added = q
        attrs.forEach { added[$0.key] = $0.value }
        guard SecItemAdd(added as CFDictionary, nil) == errSecSuccess else { throw JamError.server("Could not save the secure session. No token was stored in preferences or logs.") }
    }
    static func remove(_ origin: String) { SecItemDelete(query(origin) as CFDictionary) }
}

private final class NoAPIRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // Never forward the native credential or Origin to a redirect target.
        completionHandler(nil)
    }
}

@MainActor final class JamSession: ObservableObject {
    @Published var originText = UserDefaults.standard.string(forKey: "ourjam.origin") ?? ""
    @Published var roomText = UserDefaults.standard.string(forKey: "ourjam.room") ?? ""
    @Published var snapshot: EventSnapshot?
    @Published var error = ""
    @Published var busy = false
    @Published var connected = false
    @Published var fresh = false
    @Published var profileName = ""
    @Published var anonymous = true
    @Published var serverNow = Date()
    private(set) var origin: JamOrigin?
    private var token: String?
    private var slug = ""
    private var active = true
    private var epoch = 0
    private var refreshing = false
    private var lastGood = ProcessInfo.processInfo.systemUptime - 60
    private var serverAnchor = Date()
    private var clockAnchor = ProcessInfo.processInfo.systemUptime
    private let redirectGuard = NoAPIRedirect()
    private lazy var http: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        return URLSession(configuration: configuration, delegate: redirectGuard, delegateQueue: nil)
    }()

    var votingOpen: Bool {
        guard active, fresh, !busy, let s = snapshot, s.canContribute,
              let r = s.round, r.state == "open", let deadline = serverDate(r.deadlineAt) else { return false }
        return serverNow < deadline
    }
    var remaining: Int {
        guard let r = snapshot?.round else { return 0 }
        if r.state == "paused" { return max(0, Int(ceil((r.remainingMs ?? 0) / 1000))) }
        return max(0, Int(ceil((serverDate(r.deadlineAt) ?? serverNow).timeIntervalSince(serverNow))))
    }
    var stageURL: URL? {
        guard let origin, !slug.isEmpty else { return nil }
        return URL(string: origin.value + "/screen/" + slug)
    }
    var performerURL: URL? { origin.flatMap { URL(string: $0.value + "/performer") } }

    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, authenticated: Bool = true) async throws -> Data {
        guard let origin else { throw JamError.invalidOrigin }
        let data = try body.map { try JSONSerialization.data(withJSONObject: $0, options: [.sortedKeys]) }
        let req = try origin.apiRequest(path: path, method: method, token: authenticated ? token : nil, body: data)
        let (stream, response) = try await http.bytes(for: req)
        guard let response = response as? HTTPURLResponse else { throw JamError.invalidResponse }
        var result = Data()
        for try await byte in stream {
            guard result.count < 2 * 1024 * 1024 else { throw JamError.server("The response exceeded the native client's safe size limit.") }
            result.append(byte)
        }
        guard (200...299).contains(response.statusCode) else {
            if response.statusCode == 401 && authenticated {
                NativeKeychain.remove(origin.value)
                token = nil
                fresh = false
                connected = false
                throw JamError.server("This guest session expired or was revoked. Connect again explicitly to create a new identity, or recover your profile in the web app.")
            }
            if response.statusCode == 429 { throw JamError.server("Too many requests. Wait briefly, then refresh. Your last action was not automatically retried.") }
            let object = (try? JSONSerialization.jsonObject(with: result)) as? [String: Any]
            let message = (object?["message"] as? String) ?? "Request rejected (HTTP \(response.statusCode)). Refresh before trying again."
            throw JamError.server(String(message.prefix(500)))
        }
        return result
    }
    func connect() async {
        guard !busy else { return }
        busy = true
        error = ""
        epoch += 1
        let version = epoch
        defer { busy = false }
        do {
            #if targetEnvironment(simulator)
            let parsed = try JamOrigin(originText, allowLoopback: true)
            #else
            let parsed = try JamOrigin(originText)
            #endif
            let room = try parsed.room(roomText)
            origin = parsed
            token = try NativeKeychain.get(parsed.value)
            slug = room
            if token == nil {
                let response = try JSONDecoder().decode(NewSession.self, from: await request("/mobile/session", method: "POST", body: [:], authenticated: false))
                guard !response.token.isEmpty else { throw JamError.invalidResponse }
                token = response.token
                do { try NativeKeychain.save(response.token, origin: parsed.value) }
                catch {
                    _ = try? await request("/mobile/session", method: "DELETE")
                    token = nil
                    throw error
                }
            }
            let bytes = try await request("/events/" + room)
            let next = try JSONDecoder().decode(EventSnapshot.self, from: bytes)
            guard version == epoch else { return }
            apply(next)
            connected = true
            originText = parsed.value
            roomText = room
            UserDefaults.standard.set(parsed.value, forKey: "ourjam.origin")
            UserDefaults.standard.set(room, forKey: "ourjam.room")
            if let bytes = try? await request("/session"), let profile = try? JSONDecoder().decode(ProfileResponse.self, from: bytes) {
                profileName = profile.profile.name
                anonymous = profile.profile.anonymous
            }
        } catch { self.error = error.localizedDescription; fresh = false }
    }
    private func apply(_ next: EventSnapshot) {
        snapshot = next
        serverAnchor = serverDate(next.serverTime) ?? Date()
        clockAnchor = ProcessInfo.processInfo.systemUptime
        serverNow = serverAnchor
        lastGood = clockAnchor
        fresh = active
    }
    func refresh() async {
        guard connected, active, !refreshing, !busy else { return }
        refreshing = true
        let version = epoch
        defer { refreshing = false }
        do {
            let bytes = try await request("/events/" + slug)
            guard version == epoch else { return }
            apply(try JSONDecoder().decode(EventSnapshot.self, from: bytes))
        } catch {
            guard version == epoch else { return }
            fresh = false
            self.error = error.localizedDescription
        }
    }
    func poll() async {
        var ticks = 0
        while !Task.isCancelled {
            let now = ProcessInfo.processInfo.systemUptime
            serverNow = serverAnchor.addingTimeInterval(now - clockAnchor)
            if now - lastGood > 15 || !active { fresh = false }
            if ticks % 6 == 0 { await refresh() }
            ticks += 1
            do { try await Task.sleep(nanoseconds: 500_000_000) } catch { break }
        }
    }
    func sceneActive(_ value: Bool) {
        active = value
        fresh = false
        epoch += 1
        if value { Task { await refresh() } }
    }
    func mutate(_ path: String, method: String, body: [String: Any]) async -> Bool {
        guard connected, active, fresh, !busy else { return false }
        busy = true
        error = ""
        epoch += 1
        var succeeded = false
        do { _ = try await request(path, method: method, body: body); succeeded = true }
        catch { self.error = error.localizedDescription + " The action was not automatically resubmitted." }
        busy = false
        // Always reread the authoritative state, including after an uncertain outcome.
        await refresh()
        return succeeded
    }
    func join(roomCode: String) async {
        var body: [String: Any] = [:]
        if !roomCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { body["roomCode"] = roomCode }
        _ = await mutate("/events/" + slug + "/join", method: "POST", body: body)
    }
    func contribute(_ text: String) async -> Bool {
        guard votingOpen, let r = snapshot?.round, let used = snapshot?.usedPoints, used < 5 else { return false }
        let phrase = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !phrase.isEmpty, phrase.count <= 48 else { error = "Use 1 to 48 characters for your Sound Wave."; return false }
        return await mutate("/rounds/" + r.id + "/waves", method: "POST", body: ["commandId": UUID().uuidString, "expectedRevision": r.revision, "text": phrase])
    }
    func vote(_ wave: Wave, delta: Int) async {
        guard votingOpen, let r = snapshot?.round else { return }
        do {
            let moved = try Ballot.moved(waves: r.waves, id: wave.id, delta: delta)
            _ = await mutate("/rounds/" + r.id + "/allocations", method: "PUT", body: ["commandId": UUID().uuidString, "expectedRevision": r.revision, "allocations": moved])
        } catch { self.error = error.localizedDescription }
    }
    func saveProfile() async {
        guard !profileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, profileName.count <= 32 else { error = "Use 1 to 32 characters for your name."; return }
        _ = await mutate("/profile", method: "PATCH", body: ["name": profileName, "anonymous": anonymous])
    }
    func disconnect() {
        epoch += 1
        connected = false
        fresh = false
        snapshot = nil
        token = nil
        error = ""
    }
    func signOut() async {
        guard connected, !busy, let origin else { return }
        busy = true
        defer { busy = false }
        do {
            _ = try await request("/mobile/session", method: "DELETE")
            NativeKeychain.remove(origin.value)
            disconnect()
        } catch { self.error = "Could not confirm server sign-out. Your secure session is retained so you can retry. " + error.localizedDescription }
    }
}
