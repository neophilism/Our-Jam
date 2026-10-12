// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "OurJamCore",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "OurJamCore", targets: ["OurJamCore"])],
    targets: [
        .target(name: "OurJamCore", path: "Sources", exclude: ["OurJamApp.swift", "SessionStore.swift"], sources: ["Core.swift"]),
        .testTarget(name: "OurJamCoreTests", dependencies: ["OurJamCore"])
    ]
)
