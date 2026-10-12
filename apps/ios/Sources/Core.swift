import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum JamError: LocalizedError, Equatable {
    case invalidOrigin, invalidRoom, invalidPath, invalidVote, invalidResponse, server(String)
    public var errorDescription: String? {
        switch self {
        case .invalidOrigin: return "Enter an HTTPS server address without a path, password, query or fragment. Localhost HTTP is allowed only in Simulator."
        case .invalidRoom: return "Enter the event code or an event link from this server."
        case .invalidPath: return "This request is outside the selected Our Jam server."
        case .invalidVote: return "Keep the allocation between zero and five points. Refresh before trying again."
        case .invalidResponse: return "The server returned an unexpected response. Refresh before trying another action."
        case .server(let message): return message
        }
    }
}

public struct JamOrigin: Equatable, Sendable {
    public let url: URL
    public init(_ input: String, allowLoopback: Bool = false) throws {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let c = URLComponents(string: raw), let host = c.host, !host.isEmpty,
              c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
              c.path.isEmpty || c.path == "/", let scheme = c.scheme?.lowercased(),
              scheme == "https" || (allowLoopback && scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)),
              c.port == nil || (1...65535).contains(c.port!), var normalized = URLComponents(string: raw)
        else { throw JamError.invalidOrigin }
        normalized.path = ""
        normalized.host = host.lowercased()
        normalized.scheme = scheme
        if normalized.port == (scheme == "https" ? 443 : 80) { normalized.port = nil }
        guard let url = normalized.url else { throw JamError.invalidOrigin }
        self.url = url
    }
    public var value: String { url.absoluteString }
    public func room(_ input: String) throws -> String {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        var slug = raw.lowercased()
        if raw.contains("://") {
            guard let c = URLComponents(string: raw), c.query == nil, c.fragment == nil,
                  c.user == nil, c.password == nil, let host = c.host,
                  let candidate = try? JamOrigin("\(c.scheme ?? "")://\(host)\(c.port.map { ":\($0)" } ?? "")", allowLoopback: true), candidate == self
            else { throw JamError.invalidRoom }
            let parts = c.path.split(separator: "/", omittingEmptySubsequences: true)
            guard parts.count == 2, parts[0] == "event" else { throw JamError.invalidRoom }
            slug = String(parts[1]).lowercased()
        }
        guard !slug.isEmpty, slug.count <= 80, slug.range(of: "^[a-z0-9][a-z0-9-]*$", options: .regularExpression) != nil else { throw JamError.invalidRoom }
        return slug
    }
    public func apiRequest(path: String, method: String = "GET", token: String? = nil, body: Data? = nil) throws -> URLRequest {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains(".."), !path.contains("%"), !path.contains("?"), !path.contains("#"),
              path.range(of: "^/[a-zA-Z0-9/_-]*$", options: .regularExpression) != nil,
              ["GET", "POST", "PUT", "PATCH", "DELETE"].contains(method),
              let target = URL(string: value + "/api" + path) else { throw JamError.invalidPath }
        var request = URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(value, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token {
            guard !token.isEmpty, token.count < 1024, !token.contains(where: { $0.isNewline }) else { throw JamError.invalidResponse }
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        }
        return request
    }
    public func mediaURL(_ raw: String) throws -> URL {
        guard let url = URL(string: raw, relativeTo: self.url)?.absoluteURL,
              let c = URLComponents(url: url, resolvingAgainstBaseURL: true), c.user == nil, c.password == nil,
              c.scheme == "https" || (self.url.scheme == "http" && c.scheme == "http" && c.host == self.url.host && c.port == self.url.port)
        else { throw JamError.invalidPath }
        return url
    }
}

public struct Wave: Decodable, Identifiable, Equatable, Sendable {
    public let id, text, name: String
    public let votes, supporters, mine: Int
    public let own: Bool
    public let avatarSeed: String
}
public struct JamRound: Decodable, Identifiable, Sendable {
    public let id, sourceTitle, state, openedAt, deadlineAt: String
    public let remainingMs: Double?
    public let pauseReason: String?
    public let revision: Int
    public let waves: [Wave]
}
public struct JamEvent: Decodable, Identifiable, Sendable {
    public let id, slug, title, artistName, artistId, state: String
    public let purchaseUrl: String?
    public let revision: Int
}
public struct CrowdRelease: Decodable, Identifiable, Sendable {
    public let id, title, audio_url, download_url, published_at: String
    public let duration_seconds: Double
    public let likes, plays: Int
}
public struct GenerationJob: Decodable, Identifiable, Sendable {
    public let id, round_id, state: String
    public let reason: String?
    public var explanation: String {
        switch reason {
        case "approved_budget_zero": return "Generation stopped: the approved budget is $0. Your Sound Waves and votes were saved. No paid request was sent."
        case "provider_credit_exhausted", "provider_insufficient_credits", "insufficient_credits": return "The music provider rejected this generation because its API account has insufficient credits."
        case nil, "": return "Generation: " + state.replacingOccurrences(of: "_", with: " ")
        default: return "Generation: \(state.replacingOccurrences(of: "_", with: " ")) (\(reason!.replacingOccurrences(of: "_", with: " ")))."
        }
    }
}
public struct Admission: Decodable, Sendable {
    public let mode: String
    public let limit, contributors: Int
    public let codeConfigured: Bool
}
public struct EventSnapshot: Decodable, Sendable {
    public let serverTime: String
    public let event: JamEvent
    public let round: JamRound?
    public let releases: [CrowdRelease]
    public let jobs: [GenerationJob]
    public let people: Int
    public let joined, canContribute: Bool
    public let admission: Admission
    public var usedPoints: Int { round?.waves.reduce(0) { $0 + $1.mine } ?? 0 }
}
public struct ProfileResponse: Decodable, Sendable {
    public struct Profile: Decodable, Sendable { public let name: String; public let anonymous: Bool }
    public let profile: Profile
}
public struct NewSession: Decodable, Sendable { public let token: String }

public enum Ballot {
    public static func moved(waves: [Wave], id: String, delta: Int) throws -> [String: Int] {
        guard [-1, 1].contains(delta), waves.contains(where: { $0.id == id }), Set(waves.map(\.id)).count == waves.count else { throw JamError.invalidVote }
        var allocations: [String: Int] = [:]
        for wave in waves {
            guard (0...5).contains(wave.mine) else { throw JamError.invalidVote }
            if wave.mine > 0 { allocations[wave.id] = wave.mine }
        }
        let next = (allocations[id] ?? 0) + delta
        guard (0...5).contains(next) else { throw JamError.invalidVote }
        if next == 0 { allocations.removeValue(forKey: id) } else { allocations[id] = next }
        guard allocations.values.reduce(0, +) <= 5 else { throw JamError.invalidVote }
        return allocations
    }
}

public func serverDate(_ string: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: string) ?? ISO8601DateFormatter().date(from: string)
}
