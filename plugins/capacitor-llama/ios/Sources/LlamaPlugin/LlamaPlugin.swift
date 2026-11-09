import Foundation
import UIKit
import Capacitor
import Vision

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
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
    ]

    private let work = DispatchQueue(label: "euler.llama.work", qos: .userInitiated)
    private let ocrQueue = DispatchQueue(label: "euler.llama.ocr", qos: .userInitiated)

    override public func load() {
        // 키보드가 올라오며 웹뷰가 줄어들 때 드러나는 바탕을 앱 배경색(라이트 #f1f5fc / 다크 #1d2740)과 맞춘다
        DispatchQueue.main.async { [weak self] in
            let bg = UIColor { $0.userInterfaceStyle == .dark
                ? UIColor(red: 0x1d / 255, green: 0x27 / 255, blue: 0x40 / 255, alpha: 1)
                : UIColor(red: 0xf1 / 255, green: 0xf5 / 255, blue: 0xfc / 255, alpha: 1) }
            self?.bridge?.viewController?.view.backgroundColor = bg
            self?.bridge?.webView?.isOpaque = false
            self?.bridge?.webView?.backgroundColor = bg
            self?.bridge?.webView?.scrollView.backgroundColor = bg
        }
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
        let files = call.getObject("files") ?? [:]   // { id: [파일명] } — 모델 파일이 바뀐 경우 감지
        var models: [String: Any] = [:]
        for id in ids {
            if let names = (files[id] as? [Any])?.compactMap({ $0 as? String }), !names.isEmpty, ModelStore.shared.isComplete(id), !ModelStore.shared.isDownloading(id),
               !names.allSatisfy({ FileManager.default.fileExists(atPath: ModelStore.shared.file(id, $0).path) }) {
                // 이전 버전 모델 파일만 남아 있음 → 지우고 '받기 전' 상태로
                ModelStore.shared.delete(id)
            }
            models[id] = [
                "downloaded": ModelStore.shared.isComplete(id),
                "bundled": ModelStore.shared.isBundled(id),
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

    /// { messages: [{role, content}], images?: [base64], temperature?, maxTokens?, noThink? }
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
        let noThink = call.getBool("noThink") ?? false

        work.async { [weak self] in
            let engine = LlamaEngine.shared
            do {
                if !images.isEmpty, let last = messages.lastIndex(where: { $0.role == "user" }) {
                    let markers = String(repeating: LlamaEngine.mediaMarker + "\n", count: images.count)
                    messages[last].content = markers + messages[last].content
                }
                var prompt = try engine.buildPrompt(messages: messages)
                if noThink { prompt += "<think>\n\n</think>\n\n" }
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

    /// { image: base64(JPEG/PNG) } -> { text } — 기기 내장 Vision 글자 인식(오프라인).
    /// 비전 모델이 아닌 모델에 사진을 보낼 때 사진 속 문제를 글자로 옮기는 데 사용.
    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let b64 = call.getString("image"), let data = Data(base64Encoded: b64) else {
            call.reject("이미지가 비어 있습니다.")
            return
        }
        ocrQueue.async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ko-KR", "en-US"]
            request.usesLanguageCorrection = false   // 수식·숫자가 '교정'되지 않도록
            let handler = VNImageRequestHandler(data: data, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("사진에서 글자를 읽지 못했습니다: \(error.localizedDescription)")
                return
            }
            // Vision이 읽는 순서(위→아래, 왼→오른쪽)대로 줄을 이어 붙인다
            let lines = (request.results ?? [])
                .compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["text": lines.joined(separator: "\n")])
        }
    }

    // MARK: 키체인(GitHub 토큰 등 비밀값 보관)

    private func keychainQuery(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "euler.secure",
         kSecAttrAccount as String: key]
    }

    /// { key } -> { value? }
    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { call.reject("key가 필요합니다."); return }
        var q = keychainQuery(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data,
           let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve([:])
        }
    }

    /// { key, value? } — value가 없거나 빈 문자열이면 삭제
    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { call.reject("key가 필요합니다."); return }
        let q = keychainQuery(key)
        SecItemDelete(q as CFDictionary)
        if let value = call.getString("value"), !value.isEmpty {
            var add = q
            add[kSecValueData as String] = Data(value.utf8)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(add as CFDictionary, nil)
            guard status == errSecSuccess else { call.reject("키체인 저장 실패(\(status))"); return }
        }
        call.resolve()
    }
}
