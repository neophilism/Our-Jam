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
        let keyboardDismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [keyboardDismissed], timeout: 8), .completed, "A submitted Sound Wave should reveal the live room, not leave it covered by the keyboard")
        XCTAssertTrue(app.staticTexts["Native warm brass"].waitForExistence(timeout: 15), app.debugDescription)
        app.swipeUp()
        let support = app.buttons["Vote for Native warm brass"]
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
    @MainActor func testSponsorCountdownSurvivesVideoFailureAndPause() throws {
        continueAfterFailure = false
        func configure(ended: Bool) {
            let saved = expectation(description: "Isolated sponsor phase configured")
            var request = URLRequest(url: URL(string: "http://127.0.0.1:4173/__test__/native-sponsor")!)
            request.httpMethod = "POST"
            request.setValue("http://127.0.0.1:4173", forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try! JSONSerialization.data(withJSONObject: ["ended": ended])
            URLSession.shared.dataTask(with: request) { _, response, error in
                XCTAssertNil(error); XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200); saved.fulfill()
            }.resume()
            wait(for: [saved], timeout: 15)
        }
        configure(ended: false)
        let app = XCUIApplication()
        app.launchArguments = ["-ourjam.origin", "http://127.0.0.1:4173", "-ourjam.event", "native-integration"]
        app.launch(); XCTAssertTrue(app.buttons["connectButton"].waitForExistence(timeout: 15)); app.buttons["connectButton"].tap()
        let countdown = app.staticTexts["sponsorCountdown"]
        XCTAssertTrue(countdown.waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertEqual(countdown.label, "Our Jam begins in 15s")
        let advanced = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "Our Jam begins in 15s"), object: countdown)
        advanced.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [advanced], timeout: 4), .completed, "Paused countdown survives refresh and failed video")
        if app.buttons["joinButton"].exists { app.buttons["joinButton"].tap() }
        let field = app.textFields["waveText"]
        reveal(field, in: app); field.tap(); field.typeText("Native sponsor test")
        XCTAssertFalse(app.buttons["submitWave"].isEnabled)
        app.swipeDown()
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "OurJam-native-sponsor-countdown"; screenshot.lifetime = .keepAlways; add(screenshot)
        configure(ended: true)
        let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: countdown)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 15), .completed)
        reveal(app.buttons["submitWave"], in: app)
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: app.buttons["submitWave"])
        waitForExpectations(timeout: 10)
    }

    @MainActor func testZNativeAccountBrowserHandoff() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ourjam.origin", "http://127.0.0.1:4173", "-ourjam.event", "native-integration"]
        app.launch(); XCTAssertTrue(app.buttons["connectButton"].waitForExistence(timeout: 15)); app.buttons["connectButton"].tap()
        XCTAssertTrue(app.tabBars.buttons["You"].waitForExistence(timeout: 20)); app.tabBars.buttons["You"].tap()
        // Both a cold browser and a returning account must complete on one tap.
        // Do not retry a missed tap: that would hide Safari hover interception.
        for cycle in 1...2 {
            let login = app.buttons["accountSignIn"]; reveal(login, in: app); login.tap()
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            if springboard.buttons["Continue"].waitForExistence(timeout: 3) { springboard.buttons["Continue"].tap() }
            if app.alerts.buttons["Continue"].waitForExistence(timeout: 2) { app.alerts.buttons["Continue"].tap() }
            let browser = app.webViews.firstMatch
            let confirm = browser.buttons["Return to iOS with this account"]
            // Cold ASWebAuthenticationSession startup can exceed 25 seconds on a
            // fresh Simulator. Require the actual page/button, then an unobscured
            // control above Safari's toolbar before sending the real tap.
            XCTAssertTrue(confirm.waitForExistence(timeout: 60), app.debugDescription)
            expectation(for: NSPredicate(format: "hittable == true"), evaluatedWith: confirm)
            waitForExpectations(timeout: 10)
            XCTAssertLessThan(confirm.frame.maxY, app.frame.height * 0.82, "The native return action must be reachable above browser chrome")
            confirm.tap()
            let browserClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: browser)
            XCTAssertEqual(XCTWaiter.wait(for: [browserClosed], timeout: 20), .completed, app.debugDescription)
            let name = app.textFields["profileName"]
            XCTAssertTrue(name.waitForExistence(timeout: 20), app.debugDescription)
            reveal(name, in: app, towardTop: true)
            expectation(for: NSPredicate(format: "value == %@", "Native account fan"), evaluatedWith: name)
            waitForExpectations(timeout: 15)
            expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: login)
            waitForExpectations(timeout: 10)
            XCTAssertFalse(app.staticTexts["accountSignInError"].exists, app.debugDescription)
            let completed = expectation(description: "The server consumed this distinct native handoff")
            URLSession.shared.dataTask(with: URL(string: "http://127.0.0.1:4173/__test__/native-account-evidence")!) { data, response, error in
                XCTAssertNil(error)
                XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
                let value = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Int] }
                XCTAssertEqual(value?["completed"], cycle)
                completed.fulfill()
            }.resume()
            wait(for: [completed], timeout: 10)
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "OurJam-native-account-restored"; screenshot.lifetime = .keepAlways; add(screenshot)
        }
    }

}
