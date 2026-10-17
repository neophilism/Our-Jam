import Foundation

struct Wave: Decodable, Identifiable {
    let id: String
    let text: String
    let votes: Int
    let supporters: Int
    let mine: Int
    let own: Bool
    let name: String
}
struct CrowdRelease: Decodable, Identifiable {
    let id: String
    let title: String
    let audio_url: String
    let download_url: String
    let duration_seconds: Double
    let likes: Int
}
struct GenerationJob: Decodable, Identifiable {
    let id: String
    let state: String
    let reason: String?
    var explanation: String {
        switch reason {
        case "approved_budget_zero": return "Generation is blocked by the approved $0 budget. Your sound tags and votes are saved. No paid request was sent."
        case "provider_insufficient_credits": return "The selected music provider reported insufficient API credits."
        case "provider_not_configured": return "Generation is not enabled on this server. Participation still works."
        case "approved_budget_exhausted": return "The approved generation budget has been used."
        case "provider_price_not_verified": return "The selected provider needs an approved current price before generation."
        case "no_supported_waves": return "No supported Sound Waves were selected in this round."
        case "participation_window_too_short": return "This round was shorter than the minimum participation period."
        default: return reason?.replacingOccurrences(of: "_", with: " ") ?? state.replacingOccurrences(of: "_", with: " ")
        }
    }
}
struct EventState: Decodable {
    struct Event: Decodable { let id: String; let slug: String; let title: String; let artistName: String; let artistId: String; let state: String; let revision: Int }
    struct SponsorOpening: Decodable {
        struct Clip: Decodable { let id: String; let sponsorName: String; let slotSeconds: Double }
        let durationSeconds: Double; let elapsedMs: Double; let paused: Bool; let clips: [Clip]
    }
    struct Round: Decodable { let id: String; let sourceTitle: String; let state: String; let deadlineAt: String; let remainingMs: Double?; let revision: Int; let voteLimit: Int?; let voteMode: String?; let waves: [Wave]; let sponsorBreak: SponsorOpening? }
    struct Admission: Decodable { let mode: String; let limit: Int; let contributors: Int }
    let serverTime: String
    let event: Event
    let round: Round?
    let releases: [CrowdRelease]
    let jobs: [GenerationJob]
    let people: Int
    let joined: Bool
    let canContribute: Bool
    let admission: Admission
}
struct SessionResponse: Decodable {
    struct Profile: Decodable { let name: String; let anonymous: Bool }
    let profile: Profile?
}
struct TokenResponse: Decodable { let token: String }
struct EmptyResponse: Decodable {}
struct ServerFailure: Decodable { let error: String?; let message: String? }
struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String
    var errorDescription: String? { message }
}
