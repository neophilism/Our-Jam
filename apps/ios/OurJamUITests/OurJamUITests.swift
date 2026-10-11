import XCTest

final class OurJamUITests: XCTestCase {
    @MainActor func testRealNativeParticipation() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ourjam.origin", "http://127.0.0.1:4173", "-ourjam.event", "native-integration"]
        app.launch()
        XCTAssertTrue(app.buttons["connectButton"].waitForExistence(timeout: 10))
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.buttons["joinButton"].waitForExistence(timeout: 20), app.debugDescription)
        app.buttons["joinButton"].tap()
        let field = app.textFields["waveText"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Native warm brass")
        app.buttons["submitWave"].tap()
        XCTAssertTrue(app.staticTexts["Native warm brass"].waitForExistence(timeout: 15), app.debugDescription)
        app.swipeUp()
        let support = app.buttons["Support Native warm brass"]
        XCTAssertTrue(support.waitForExistence(timeout: 10))
        support.tap()
        let saved = expectation(description: "Native vote persisted in actual backend")
        URLSession.shared.dataTask(with: URL(string: "http://127.0.0.1:4173/__test__/native-evidence")!) { data, _, error in
            XCTAssertNil(error)
            let result = data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            XCTAssertEqual(result?["text"] as? String, "Native warm brass")
            XCTAssertGreaterThanOrEqual(result?["points"] as? Int ?? 0, 1)
            saved.fulfill()
        }.resume()
        wait(for: [saved], timeout: 10)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "OurJam-native-real-session"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
