// swift-tools-version: 5.9
import PackageDescription

// llama.xcframework는 scripts/fetch-llama.sh 가 ggml-org/llama.cpp 공식 릴리스에서 내려받습니다(저장소에는 넣지 않음).
let package = Package(
    name: "CapacitorLlama",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "CapacitorLlama", targets: ["LlamaPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(name: "llama", path: "ios/Frameworks/llama.xcframework"),
        .target(
            name: "LlamaPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "llama"
            ],
            path: "ios/Sources/LlamaPlugin"
        )
    ]
)
