import XCTest
@testable import OurJamCore

final class CoreTests: XCTestCase {
    func testOriginRejectsCredentialAndQueryLeakage() throws {
        for input in ["https://key@example.com", "https://example.com?token=x", "https://example.com/path", "http://example.com", "file:///tmp/x", "https://example.com/#secret"] {
            XCTAssertThrowsError(try JamOrigin(input))
        }
        XCTAssertEqual(try JamOrigin(" HTTPS://EXAMPLE.COM:443/ ").value, "https://example.com")
    }
    func testLoopbackIsAnExplicitSimulatorOnlyChoice() throws {
        XCTAssertThrowsError(try JamOrigin("http://localhost:3001"))
        XCTAssertEqual(try JamOrigin("http://localhost:3001", allowLoopback: true).value, "http://localhost:3001")
        XCTAssertThrowsError(try JamOrigin("http://192.168.1.1:3001", allowLoopback: true))
    }
    func testRoomLinksAreOriginBound() throws {
        let origin = try JamOrigin("https://jam.example")
        XCTAssertEqual(try origin.room(" FIRST-SHOW "), "first-show")
        XCTAssertEqual(try origin.room("https://jam.example/event/first-show"), "first-show")
        for value in ["https://evil.example/event/first-show", "https://jam.example/event/show?token=x", "../x", "x/y", ""] {
            XCTAssertThrowsError(try origin.room(value))
        }
    }
    func testNativeRequestsRetainExactOriginAndSession() throws {
        let origin = try JamOrigin("https://jam.example")
        let request = try origin.apiRequest(path: "/events/first-show/join", method: "POST", token: "native-test-token", body: Data("{}".utf8))
        XCTAssertEqual(request.url?.absoluteString, "https://jam.example/api/events/first-show/join")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), origin.value)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer native-test-token")
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertEqual(request.httpMethod, "POST")
    }
    func testRequestPathCannotEscapeOrCarrySecrets() throws {
        let origin = try JamOrigin("https://jam.example")
        for path in ["//evil.example", "/../x", "/%2e%2e/x", "/session?key=x", "https://evil.example"] {
            XCTAssertThrowsError(try origin.apiRequest(path: path))
        }
        XCTAssertThrowsError(try origin.apiRequest(path: "/session", token: "x\nHeader: x"))
    }
    private func waves(_ first: Int, _ second: Int) throws -> [Wave] {
        let data = """
        [{"id":"a","text":"Trumpet","votes":4,"supporters":2,"mine":\(first),"own":true,"name":"You","avatarSeed":"a"},
         {"id":"b","text":"Drums","votes":3,"supporters":2,"mine":\(second),"own":false,"name":"Fan","avatarSeed":"b"}]
        """
        return try JSONDecoder().decode([Wave].self, from: Data(data.utf8))
    }
    func testFivePointBudgetAndZeroRemoval() throws {
        XCTAssertThrowsError(try Ballot.moved(waves: waves(3, 2), id: "b", delta: 1))
        XCTAssertEqual(try Ballot.moved(waves: waves(1, 2), id: "a", delta: -1), ["b":2])
        XCTAssertEqual(try Ballot.moved(waves: waves(1, 2), id: "b", delta: 1), ["a":1, "b":3])
        XCTAssertThrowsError(try Ballot.moved(waves: waves(0, 0), id: "a", delta: -1))
        XCTAssertThrowsError(try Ballot.moved(waves: waves(0, 0), id: "unknown", delta: 1))
    }
    func testZeroBudgetIsNotReportedAsProviderCreditError() throws {
        let data = Data("{\"id\":\"j\",\"round_id\":\"r\",\"state\":\"blocked\",\"reason\":\"approved_budget_zero\"}".utf8)
        let job = try JSONDecoder().decode(GenerationJob.self, from: data)
        XCTAssertTrue(job.explanation.contains("No paid request was sent"))
        XCTAssertFalse(job.explanation.contains("provider rejected"))
    }
    func testMediaDoesNotAcceptUnsafeURLs() throws {
        let origin = try JamOrigin("https://jam.example")
        XCTAssertEqual(try origin.mediaURL("/api/releases/r/audio").absoluteString, "https://jam.example/api/releases/r/audio")
        XCTAssertEqual(try origin.mediaURL("https://media.example/r.mp3").host, "media.example")
        for raw in ["javascript:alert(1)", "file:///tmp/x", "http://media.example/x", "https://token@media.example/x"] { XCTAssertThrowsError(try origin.mediaURL(raw)) }
    }
    func testServerClockAcceptsBothISOFormats() {
        XCTAssertNotNil(serverDate("2026-10-12T12:00:00.000Z"))
        XCTAssertNotNil(serverDate("2026-10-12T12:00:00Z"))
        XCTAssertNil(serverDate("not a date"))
    }
}
