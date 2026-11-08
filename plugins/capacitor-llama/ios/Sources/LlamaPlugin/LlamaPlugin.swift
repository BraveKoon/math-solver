import Foundation
import Capacitor

/// JS 이름: "Llama". 이벤트: "downloadProgress", "token".
@objc(LlamaPlugin)
public class LlamaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LlamaPlugin"
    public let jsName = "Llama"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let work = DispatchQueue(label: "euler.llama.work", qos: .userInitiated)

    override public func load() {
        ModelStore.shared.onProgress = { [weak self] id, index, count, received, total in
            self?.notifyListeners("downloadProgress", data: [
                "id": id, "fileIndex": index, "fileCount": count,
                "received": received, "total": total,
            ])
        }
    }

    /// ids 각각의 다운로드 여부, 현재 로드된 모델, 남은 저장 공간.
    @objc func status(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        var models: [String: Any] = [:]
        for id in ids {
            models[id] = [
                "downloaded": ModelStore.shared.isComplete(id),
                "downloading": ModelStore.shared.isDownloading(id),
                "bytes": ModelStore.shared.bytesOnDisk(id),
            ]
        }
        work.async {
            let loaded = LlamaEngine.shared.loadedId
            call.resolve([
                "models": models,
                "loaded": loaded ?? "",
                "vision": LlamaEngine.shared.hasVision,
                "freeBytes": ModelStore.freeBytes,
            ])
        }
    }

    /// { id, urls: [String], names: [String] } — 모든 파일을 받으면 resolve.
    @objc func download(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let urls = call.getArray("urls", String.self),
              let names = call.getArray("names", String.self),
              urls.count == names.count, !urls.isEmpty else {
            call.reject("잘못된 다운로드 요청입니다.")
            return
        }
        var files: [(url: URL, name: String)] = []
        for (u, n) in zip(urls, names) {
            guard let url = URL(string: u) else { call.reject("잘못된 주소: \(u)"); return }
            files.append((url, n))
        }
        ModelStore.shared.download(id: id, files: files) { error in
            if let error { call.reject(error.localizedDescription) } else { call.resolve(["id": id]) }
        }
    }

    @objc func cancelDownload(_ call: CAPPluginCall) {
        if let id = call.getString("id") { ModelStore.shared.cancel(id) }
        call.resolve()
    }

    @objc func deleteModel(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id가 필요합니다."); return }
        work.async {
            if LlamaEngine.shared.loadedId == id { LlamaEngine.shared.unload() }
            ModelStore.shared.delete(id)
            call.resolve()
        }
    }

    /// { id, file, mmproj?, nCtx? }
    @objc func load(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let fileName = call.getString("file") else {
            call.reject("id와 file이 필요합니다.")
            return
        }
        let mmproj = call.getString("mmproj")
        let nCtx = UInt32(call.getInt("nCtx") ?? 4096)
        work.async {
            let store = ModelStore.shared
            guard store.isComplete(id) else { call.reject("모델을 먼저 내려받아 주세요."); return }
            do {
                if LlamaEngine.shared.loadedId != id {
                    try LlamaEngine.shared.load(
                        id: id,
                        modelPath: store.file(id, fileName).path,
                        mmprojPath: mmproj.map { store.file(id, $0).path },
                        nCtx: nCtx)
                }
                call.resolve(["id": id, "vision": LlamaEngine.shared.hasVision])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        work.async {
            LlamaEngine.shared.unload()
            call.resolve()
        }
    }

    /// { messages: [{role, content}], images?: [base64], temperature?, maxTokens? }
    /// images는 마지막 사용자 메시지에 붙습니다. 토큰은 "token" 이벤트로 전달.
    @objc func generate(_ call: CAPPluginCall) {
        let raw = call.getArray("messages") ?? []
        var messages: [(role: String, content: String)] = raw.compactMap { item in
            guard let obj = item as? JSObject, let role = obj["role"] as? String,
                  let content = obj["content"] as? String else { return nil }
            return (role, content)
        }
        guard !messages.isEmpty else { call.reject("메시지가 비어 있습니다."); return }
        let images = (call.getArray("images", String.self) ?? []).compactMap { Data(base64Encoded: $0) }
        let temperature = call.getFloat("temperature") ?? 0.6
        let maxTokens = call.getInt("maxTokens") ?? 2048

        work.async { [weak self] in
            let engine = LlamaEngine.shared
            do {
                if !images.isEmpty, let last = messages.lastIndex(where: { $0.role == "user" }) {
                    let markers = String(repeating: LlamaEngine.mediaMarker + "\n", count: images.count)
                    messages[last].content = markers + messages[last].content
                }
                let prompt = try engine.buildPrompt(messages: messages)
                var buffer = ""
                var lastFlush = Date()
                let reason = try engine.generate(prompt: prompt, images: images, temperature: temperature,
                                                 maxTokens: maxTokens) { text in
                    buffer += text
                    if Date().timeIntervalSince(lastFlush) > 0.04 {
                        self?.notifyListeners("token", data: ["text": buffer])
                        buffer = ""
                        lastFlush = Date()
                    }
                }
                if !buffer.isEmpty { self?.notifyListeners("token", data: ["text": buffer]) }
                call.resolve(["stopReason": reason])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        LlamaEngine.shared.stopRequested = true
        call.resolve()
    }
}
