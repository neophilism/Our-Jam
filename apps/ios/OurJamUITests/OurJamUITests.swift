import XCTest

final class OurJamUITests: XCTestCase {
    @MainActor private func reveal(_ element: XCUIElement, in app: XCUIApplication, towardTop: Bool = false, file: StaticString = #filePath, line: UInt = #line) {
        // A whole-screen swipe can land on the software keyboard rather than
        // the Form. Keep this gesture between the navigation bar and keyboard.
        for _ in 0..<8 {
            if element.waitForExistence(timeout: 1), element.isHittable { return }
            let top = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
            let bottom = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.53))
            if towardTop { top.press(forDuration: 0.1, thenDragTo: bottom) }
            else { bottom.press(forDuration: 0.1, thenDragTo: top) }
        }
        XCTAssertTrue(element.exists && element.isHittable, app.debugDescription, file: file, line: line)
    }

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
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 8), .completed, "Saving a profile must dismiss the keyboard")
        let follow = app.buttons["followArtist"]
        reveal(follow, in: app)
        if follow.label == "Follow artist" { follow.tap() }
        let followed = NSPredicate(format: "label == %@", "Unfollow artist")
        expectation(for: followed, evaluatedWith: follow)
        waitForExpectations(timeout: 15)
        let create = app.buttons["createRecoveryKey"]
        reveal(create, in: app, towardTop: true)
        create.tap()
        app.buttons["Create and show key"].tap()
        let keyView = app.staticTexts["newRecoveryKey"]
        XCTAssertTrue(keyView.waitForExistence(timeout: 15))
        let key = keyView.label
        XCTAssertTrue(key.hasPrefix("ojr_"))
        XCTAssertEqual(key.count, 68)
        // Cover at least one of the real three-second snapshot refreshes.
        // A briefly visible key is not acceptance: the fan must be able to save it.
        let vanished = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: keyView)
        vanished.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [vanished], timeout: 4), .completed, "The recovery disclosure must survive form updates")
        XCTAssertTrue(keyView.label == key, "The disclosed key must not change")
        let savedButton = app.buttons["recoveryKeySaved"]
        XCTAssertTrue(savedButton.waitForExistence(timeout: 5))
        XCTAssertTrue(savedButton.isHittable, "The save confirmation must be reachable on the small screen")
        savedButton.tap()
        let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: keyView)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 5), .completed)
        app.terminate()
        app.launch()
        let restore = app.secureTextFields["restoreRecoveryKey"]
        reveal(restore, in: app)
        restore.tap(); restore.typeText(key)
        let restoreButton = app.buttons["restoreProfile"]
        reveal(restoreButton, in: app)
        restoreButton.tap()
        app.buttons["Restore saved profile"].tap()
        XCTAssertTrue(app.tabBars.buttons["You"].waitForExistence(timeout: 20))
        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.textFields["profileName"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.textFields["profileName"].value as? String, "Native returning fan")
        let restoredFollow = app.buttons["followArtist"]
        reveal(restoredFollow, in: app)
        expectation(for: followed, evaluatedWith: restoredFollow)
        waitForExpectations(timeout: 15)
        // The key belongs only to the ephemeral loopback CI database. It is
        // never a production profile or an external service credential.
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
