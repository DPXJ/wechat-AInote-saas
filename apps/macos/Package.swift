// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "AIXinjiMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "AIXinjiMac", targets: ["AIXinjiMac"])
    ],
    targets: [
        .executableTarget(name: "AIXinjiMac")
    ]
)
