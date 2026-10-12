import Foundation
import Security
import CryptoKit

final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Never forward a guest credential to another origin.
    }
}
struct GuestKeychain {
    static func account(_ origin: String) -> String { SHA256.hash(data: Data(origin.utf8)).map { String(format: "%02x", $0) }.joined() }
    static func query(_ origin: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.neophilism.ourjam.guest", kSecAttrAccount as String: account(origin)]
    }
    static func read(_ origin: String) throws -> String? {
        var q = query(origin); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let result = SecItemCopyMatching(q as CFDictionary, &item)
        if result == errSecItemNotFound { return nil }
        guard result == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { throw APIError(status: 0, code: "keychain", message: "Secure identity storage could not be read (Keychain status \(result)).") }
        return value
    }
    static func write(_ origin: String, _ value: String) throws {
        var q = query(origin)
        let data = Data(value.utf8)
        let update = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        guard update == errSecItemNotFound else { throw APIError(status: 0, code: "keychain", message: "Secure identity storage could not be updated (Keychain status \(update)).") }
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(q as CFDictionary, nil)
        guard added == errSecSuccess else { throw APIError(status: 0, code: "keychain", message: "Secure identity storage could not be saved (Keychain status \(added)).") }
    }
    static func remove(_ origin: String) throws {
        let status = SecItemDelete(query(origin) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw APIError(status: 0, code: "keychain", message: "This device could not remove its saved identity.") }
    }
}

@MainActor final class JamAPI {
    let origin: String
    private var token: String?
    private let redirect = NoRedirect()
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        return URLSession(configuration: configuration, delegate: redirect, delegateQueue: nil)
    }()
    static func canonicalOrigin(_ value: String) throws -> String {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URLComponents(string: value), let host = url.host?.lowercased(), url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/", url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(host)) else { throw APIError(status: 0, code: "origin", message: "Use your Our Jam HTTPS server address. Only localhost or 127.0.0.1 may use HTTP for a simulator on the same Mac.") }
        let scheme = url.scheme!
        let port = url.port.flatMap { ($0 == 443 && scheme == "https") || ($0 == 80 && scheme == "http") ? nil : ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }
    init(origin: String) throws { self.origin = try Self.canonicalOrigin(origin) }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> T {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), let url = URL(string: origin + "/api" + path) else { throw APIError(status: 0, code: "path", message: "Invalid application path.") }
        var request = URLRequest(url: url); request.httpMethod = method
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body); request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, data.count <= 4 * 1024 * 1024 else { throw APIError(status: 0, code: "response", message: "The server returned an invalid response.") }
        guard (200..<300).contains(http.statusCode) else {
            let failure = try? JSONDecoder().decode(ServerFailure.self, from: data)
            throw APIError(status: http.statusCode, code: failure?.error ?? "http", message: failure?.message ?? "The server could not complete that request (\(http.statusCode)).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func ensureSession() async throws {
        token = try GuestKeychain.read(origin)
        if token != nil {
            let state: SessionResponse = try await request("/session")
            guard state.profile != nil else { throw APIError(status: 401, code: "expired", message: "The saved identity expired. Recover your profile or explicitly reset this device session.") }
            return
        }
        let created: TokenResponse = try await request("/mobile/session", method: "POST", body: [:])
        guard created.token.range(of: "^ojm_[a-f0-9]{64}$", options: .regularExpression) != nil else { throw APIError(status: 0, code: "token", message: "The server returned an invalid device credential.") }
        token = created.token
        do { try GuestKeychain.write(origin, created.token) }
        catch {
            let _: EmptyResponse? = try? await request("/mobile/session", method: "DELETE")
            token = nil
            throw error
        }
    }
    func signOut() async throws {
        do { let _: EmptyResponse = try await request("/mobile/session", method: "DELETE") }
        catch let error as APIError where error.status == 401 { }
        try GuestKeychain.remove(origin); token = nil
    }
    func mediaURL(_ raw: String) -> URL? {
        guard let base = URL(string: origin), let url = URL(string: raw, relativeTo: base)?.absoluteURL, url.user == nil, url.password == nil else { return nil }
        if url.scheme == "https" { return url }
        if url.scheme == "http", url.host == base.host, url.port == base.port, ["localhost", "127.0.0.1"].contains(base.host ?? "") { return url }
        return nil
    }
}
