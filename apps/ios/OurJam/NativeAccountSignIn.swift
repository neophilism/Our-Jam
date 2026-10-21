import SwiftUI
import UIKit
import AuthenticationServices
import CryptoKit
import Security

private struct AccountSignInConfig: Decodable { let enabled: Bool }
private struct NativeSignInStart: Decodable { let requestId: String; let signInUrl: String }

@MainActor final class NativeAccountBrowser: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
    func cancel() { session?.cancel() }
    func authenticate(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let browser = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.neophilism.ourjam") { [weak self] callback, error in
                Task { @MainActor in
                    self?.session = nil
                    if let callback { continuation.resume(returning: callback) }
                    else { continuation.resume(throwing: error ?? APIError(status: 0, code: "cancelled", message: "Account sign-in was cancelled.")) }
                }
            }
            browser.presentationContextProvider = self
            browser.prefersEphemeralWebBrowserSession = true
            self.session = browser
            if !browser.start() {
                self.session = nil
                continuation.resume(throwing: APIError(status: 0, code: "browser", message: "Account sign-in could not open. Try again."))
            }
        }
    }
}
struct NativeAccountSignIn: View {
    @ObservedObject var model: SessionModel
    var onSignedIn: () -> Void = {}
    @StateObject private var browser = NativeAccountBrowser()
    @State private var enabled: Bool?
    @State private var error = ""
    private func signIn() async {
        guard let api = model.api, !model.busy else { return }
        model.busy = true; error = ""
        defer { model.busy = false }
        do {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw APIError(status: 0, code: "random", message: "Secure sign-in could not start.") }
            let verifier = bytes.map { String(format: "%02x", $0) }.joined()
            let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            let start: NativeSignInStart = try await api.request("/identity/native/start", method: "POST", body: ["challenge": challenge])
            guard let url = URL(string: start.signInUrl), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false), url.scheme == URL(string: api.origin)?.scheme, url.host == URL(string: api.origin)?.host, url.port == URL(string: api.origin)?.port, url.user == nil, url.password == nil, url.path == "/signin", parts.queryItems?.first(where: { $0.name == "native" })?.value == start.requestId else { throw APIError(status: 0, code: "origin", message: "The app sign-in address was invalid.") }
            let callback = try await browser.authenticate(url)
            guard model.api === api, callback.scheme == "com.neophilism.ourjam", callback.host == "signin", let values = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems, values.filter({ $0.name == "request" }).count == 1, values.filter({ $0.name == "code" }).count == 1, values.first(where: { $0.name == "request" })?.value == start.requestId, let code = values.first(where: { $0.name == "code" })?.value, code.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw APIError(status: 0, code: "handoff", message: "This sign-in response does not belong to this device.") }
            let result: TokenResponse = try await api.request("/identity/native/redeem", method: "POST", body: ["requestId": start.requestId, "code": code, "verifier": verifier])
            try await api.installAccountToken(result.token)
            onSignedIn()
            try await model.accountChanged(using: api)
        } catch { self.error = error.localizedDescription }
    }
    var body: some View {
        Section("Your account") {
            if enabled == true {
                Button("Sign in or create an account") { Task { await signIn() } }.disabled(model.busy).accessibilityIdentifier("accountSignIn")
                Text("Use Google or email in a secure browser. Signing in restores your account profile here; separate guest votes stay with their original profile.").font(.footnote)
            } else if enabled == nil {
                Text("Checking sign-in options…").font(.footnote)
            } else {
                Text("You can participate as a guest on this server. Account sign-in is not available here yet.").font(.footnote)
            }
            if !error.isEmpty { Text(error).foregroundStyle(.orange).accessibilityIdentifier("accountSignInError") }
        }.task(id: model.origin) {
            guard let api = model.api else { return }
            let config: AccountSignInConfig? = try? await api.request("/identity/config")
            enabled = config?.enabled == true
        }.onDisappear { browser.cancel() }
    }
}
