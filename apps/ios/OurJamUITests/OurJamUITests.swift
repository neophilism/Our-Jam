import XCTest

final class OurJamUITests: XCTestCase {
    @MainActor func testNativeProfileRecoveryAndFollowing() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ourjam.origin", "http://127.0.0.1:4173", "-ourjam.event", "native-integration"]
        app.launch()
        XCTAssertTrue(app.buttons["connectButton"].waitForExistence(timeout: 15))
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.tabBars.buttons["You"].waitForExistence(timeout: 20))
        app.tabBars.buttons["You"].tap()
        let name = app.textFields["profileName"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        name.tap()
        let existing = (name.value as? String) ?? ""
        name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count) + "Native returning fan")
        app.buttons["saveProfile"].tap()
        app.swipeUp()
        let follow = app.buttons["followArtist"]
        XCTAssertTrue(follow.waitForExistence(timeout: 15))
        if follow.label == "Follow artist" { follow.tap() }
        let followed = NSPredicate(format: "label == %@", "Unfollow artist")
        expectation(for: followed, evaluatedWith: follow)
        waitForExpectations(timeout: 15)
        app.buttons["createRecoveryKey"].tap()
        app.buttons["Create and show key"].tap()
        let keyView = app.staticTexts["newRecoveryKey"]
        XCTAssertTrue(keyView.waitForExistence(timeout: 15))
        let key = keyView.label
        XCTAssertTrue(key.hasPrefix("ojr_"))
        XCTAssertEqual(key.count, 68)
        app.buttons["I saved it"].tap()
        app.terminate()
        app.launch()
        let restore = app.secureTextFields["restoreRecoveryKey"]
        XCTAssertTrue(restore.waitForExistence(timeout: 15))
        restore.tap(); restore.typeText(key)
        app.buttons["restoreProfile"].tap()
        app.buttons["Restore saved profile"].tap()
        XCTAssertTrue(app.tabBars.buttons["You"].waitForExistence(timeout: 20))
        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.textFields["profileName"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.textFields["profileName"].value as? String, "Native returning fan")
        app.swipeUp()
        XCTAssertTrue(app.buttons["followArtist"].waitForExistence(timeout: 15))
        expectation(for: followed, evaluatedWith: app.buttons["followArtist"])
        waitForExpectations(timeout: 15)
        // This credential belongs only to the ephemeral, loopback CI database.
        // No production profile or service credential is used in this test.
    }

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
