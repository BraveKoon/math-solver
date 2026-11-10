import Foundation
import UIKit
import llama

struct LlamaError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

/// llama.cpp(텍스트) + mtmd(이미지) 래퍼. 모든 메서드는 같은 직렬 큐에서 호출해야 합니다(stop 제외).
final class LlamaEngine {
    static let shared = LlamaEngine()

    private var model: OpaquePointer?
    private var ctx: OpaquePointer?
    private var mctx: OpaquePointer?
    private(set) var loadedId: String?

    private let stopLock = NSLock()
    private var stopFlag = false
    var stopRequested: Bool {
        get { stopLock.lock(); defer { stopLock.unlock() }; return stopFlag }
        set { stopLock.lock(); stopFlag = newValue; stopLock.unlock() }
    }

    var hasVision: Bool { mctx != nil }

    private init() {
        llama_backend_init()
    }

    private static var gpuLayers: Int32 {
        #if targetEnvironment(simulator)
        return 0
        #else
        return 999
        #endif
    }

    private static var threads: Int32 {
        Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount - 2)))
    }

    func unload() {
        if let m = mctx { mtmd_free(m); mctx = nil }
        if let c = ctx { llama_free(c); ctx = nil }
        if let m = model { llama_model_free(m); model = nil }
        loadedId = nil
    }

    func load(id: String, modelPath: String, mmprojPath: String?, nCtx: UInt32) throws {
        unload()
        var mparams = llama_model_default_params()
        mparams.n_gpu_layers = Self.gpuLayers
        guard let m = llama_model_load_from_file(modelPath, mparams) else {
            throw LlamaError("모델 파일을 열 수 없습니다. 다시 내려받아 주세요.")
        }
        model = m

        var cparams = llama_context_default_params()
        cparams.n_ctx = nCtx
        cparams.n_batch = 512
        cparams.n_ubatch = 512
        cparams.n_threads = Self.threads
        cparams.n_threads_batch = Self.threads
        guard let c = llama_init_from_model(m, cparams) else {
            unload()
            throw LlamaError("메모리가 부족해 모델을 실행할 수 없습니다. 더 작은 모델을 선택하세요.")
        }
        ctx = c

        if let mmproj = mmprojPath {
            var vparams = mtmd_context_params_default()
            vparams.use_gpu = Self.gpuLayers > 0
            vparams.n_threads = Self.threads
            vparams.print_timings = false
            guard let mc = mtmd_init_from_file(mmproj, m, vparams) else {
                unload()
                throw LlamaError("이미지 인식 모듈을 불러오지 못했습니다.")
            }
            mctx = mc
        }
        loadedId = id
    }

    // MARK: - Prompt

    func buildPrompt(messages: [(role: String, content: String)]) throws -> String {
        guard let model else { throw LlamaError("모델이 로드되지 않았습니다.") }
        let tmpl = llama_model_chat_template(model, nil)
        let roles = messages.map { strdup($0.role)! }
        let contents = messages.map { strdup($0.content)! }
        defer { (roles + contents).forEach { free($0) } }
        var chat = (0..<messages.count).map {
            llama_chat_message(role: UnsafePointer(roles[$0]), content: UnsafePointer(contents[$0]))
        }
        var buf = [CChar](repeating: 0, count: 16 * 1024)
        var n = llama_chat_apply_template(tmpl, &chat, chat.count, true, &buf, Int32(buf.count))
        if n > Int32(buf.count) {
            buf = [CChar](repeating: 0, count: Int(n) + 1)
            n = llama_chat_apply_template(tmpl, &chat, chat.count, true, &buf, Int32(buf.count))
        }
        guard n >= 0 else { throw LlamaError("이 모델의 대화 형식을 적용할 수 없습니다.") }
        return String(decoding: buf[0..<Int(n)].map { UInt8(bitPattern: $0) }, as: UTF8.self)
    }

    static var mediaMarker: String { String(cString: mtmd_default_marker()) }

    // MARK: - Generation

    /// 프롬프트를 처음부터 평가하고 토큰을 스트리밍합니다. 반환값은 종료 사유.
    func generate(prompt: String, images: [Data], temperature: Float, maxTokens: Int,
                  onText: (String) -> Void) throws -> String {
        guard let model, let ctx else { throw LlamaError("모델이 로드되지 않았습니다.") }
        stopRequested = false
        let vocab = llama_model_get_vocab(model)
        llama_memory_clear(llama_get_memory(ctx), true)
        let nCtx = Int(llama_n_ctx(ctx))
        var nPast: Int32 = 0

        if !images.isEmpty {
            guard let mctx else { throw LlamaError("이 모델은 이미지를 읽을 수 없습니다. '오일러 비전'을 선택하세요.") }
            var bitmaps: [OpaquePointer?] = []
            defer { bitmaps.forEach { if let b = $0 { mtmd_bitmap_free(b) } } }
            for data in images {
                guard let b = Self.makeBitmap(data) else { throw LlamaError("이미지를 읽을 수 없습니다.") }
                bitmaps.append(b)
            }
            guard let chunks = mtmd_input_chunks_init() else { throw LlamaError("이미지 처리 준비에 실패했습니다.") }
            defer { mtmd_input_chunks_free(chunks) }
            let rc: Int32 = prompt.withCString { cstr in
                var text = mtmd_input_text(text: cstr, text_len: strlen(cstr), add_special: true, parse_special: true)
                return bitmaps.withUnsafeBufferPointer { bp in
                    mtmd_tokenize(mctx, chunks, &text, bp.baseAddress, bp.count)
                }
            }
            guard rc == 0 else { throw LlamaError("이미지와 질문을 처리하지 못했습니다(\(rc)).") }
            var newPast: llama_pos = 0
            guard mtmd_helper_eval_chunks(mctx, ctx, chunks, 0, 0, 512, true, &newPast) == 0 else {
                throw LlamaError("이미지를 분석하는 중 오류가 났습니다. 메모리가 부족할 수 있습니다.")
            }
            nPast = newPast
        } else {
            var tokens = Self.tokenize(prompt, vocab: vocab)
            guard tokens.count < nCtx - 32 else { throw LlamaError("대화가 너무 깁니다. 새 세션을 시작하세요.") }
            var i = 0
            while i < tokens.count {
                if stopRequested { return "stopped" }
                let n = min(512, tokens.count - i)
                let rc = tokens.withUnsafeMutableBufferPointer { bp in
                    llama_decode(ctx, llama_batch_get_one(bp.baseAddress! + i, Int32(n)))
                }
                guard rc == 0 else { throw LlamaError("질문을 처리하지 못했습니다(\(rc)).") }
                i += n
            }
            nPast = Int32(tokens.count)
        }

        guard let smpl = llama_sampler_chain_init(llama_sampler_chain_default_params()) else {
            throw LlamaError("샘플러를 만들 수 없습니다.")
        }
        defer { llama_sampler_free(smpl) }
        // 같은 문장을 되풀이하는 루프를 줄이기 위한 반복 억제(최근 128토큰, 숫자가 많은 수학에서도 과하지 않은 값)
        llama_sampler_chain_add(smpl, llama_sampler_init_penalties(128, 1.1, 0.0, 0.3))
        if temperature <= 0 {
            llama_sampler_chain_add(smpl, llama_sampler_init_greedy())
        } else {
            llama_sampler_chain_add(smpl, llama_sampler_init_top_k(20))
            llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.95, 1))
            llama_sampler_chain_add(smpl, llama_sampler_init_temp(temperature))
            llama_sampler_chain_add(smpl, llama_sampler_init_dist(0xFFFF_FFFF))
        }

        var utf8 = UTF8Stream()
        var produced = 0
        var reason = "eos"
        var history: [llama_token] = []
        while true {
            if stopRequested { reason = "stopped"; break }
            if produced >= maxTokens { reason = "length"; break }
            if Int(nPast) >= nCtx - 1 { reason = "context"; break }
            var token = llama_sampler_sample(smpl, ctx, -1)
            if llama_vocab_is_eog(vocab, token) { break }
            if let s = utf8.append(Self.piece(vocab, token)) { onText(s) }
            let rc = llama_decode(ctx, llama_batch_get_one(&token, 1))
            guard rc == 0 else { throw LlamaError("답변 생성 중 오류가 났습니다(\(rc)).") }
            nPast += 1
            produced += 1
            history.append(token)
            // 억제로도 못 막은 반복 루프: 같은 토큰 묶음이 4번 연속 반복되면 멈춘다
            if produced % 16 == 0, Self.isLooping(history) { reason = "repeat"; break }
        }
        if let rest = utf8.flush() { onText(rest) }
        return reason
    }

    // MARK: - Helpers

    /// 끝부분이 길이 6~96 토큰짜리 묶음의 4회 이상 연속 반복이면 true
    static func isLooping(_ t: [llama_token]) -> Bool {
        let n = t.count
        for len in 6...96 where n >= len * 4 {
            var same = true
            for i in 0..<(len * 3) where t[n - 1 - i] != t[n - 1 - i - len] { same = false; break }
            if same { return true }
        }
        return false
    }

    private static func tokenize(_ text: String, vocab: OpaquePointer?) -> [llama_token] {
        let len = Int32(text.utf8.count)
        var tokens = [llama_token](repeating: 0, count: Int(len) + 16)
        var n = llama_tokenize(vocab, text, len, &tokens, Int32(tokens.count), true, true)
        if n < 0 {
            tokens = [llama_token](repeating: 0, count: Int(-n))
            n = llama_tokenize(vocab, text, len, &tokens, Int32(tokens.count), true, true)
        }
        return Array(tokens.prefix(Int(max(0, n))))
    }

    private static func piece(_ vocab: OpaquePointer?, _ token: llama_token) -> [UInt8] {
        var buf = [CChar](repeating: 0, count: 64)
        var n = llama_token_to_piece(vocab, token, &buf, Int32(buf.count), 0, true)
        if n < 0 {
            buf = [CChar](repeating: 0, count: Int(-n))
            n = llama_token_to_piece(vocab, token, &buf, Int32(buf.count), 0, true)
        }
        return buf.prefix(Int(max(0, n))).map { UInt8(bitPattern: $0) }
    }

    /// JPEG/PNG 데이터를 RGB 비트맵으로 변환(긴 변 최대 1024px). 방향 보정은 JS에서 캔버스로 이미 처리됨.
    private static func makeBitmap(_ data: Data) -> OpaquePointer? {
        guard let image = UIImage(data: data)?.cgImage else { return nil }
        let scale = min(1.0, 1024.0 / Double(max(image.width, image.height)))
        let w = max(1, Int(Double(image.width) * scale))
        let h = max(1, Int(Double(image.height) * scale))
        var rgba = [UInt8](repeating: 0, count: w * h * 4)
        let drawn: Bool = rgba.withUnsafeMutableBytes { raw in
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let cg = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8,
                                     bytesPerRow: w * 4, space: space,
                                     bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            cg.interpolationQuality = .high
            cg.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }
        var rgb = [UInt8](repeating: 0, count: w * h * 3)
        for i in 0..<(w * h) {
            rgb[i * 3] = rgba[i * 4]
            rgb[i * 3 + 1] = rgba[i * 4 + 1]
            rgb[i * 3 + 2] = rgba[i * 4 + 2]
        }
        return rgb.withUnsafeBufferPointer { mtmd_bitmap_init(UInt32(w), UInt32(h), $0.baseAddress) }
    }
}

/// 토큰 조각이 한글처럼 여러 바이트 문자의 중간에서 끊겨도 깨지지 않게 완성된 문자만 내보냅니다.
struct UTF8Stream {
    private var pending: [UInt8] = []

    mutating func append(_ bytes: [UInt8]) -> String? {
        pending += bytes
        guard !pending.isEmpty else { return nil }
        for k in 0...min(3, pending.count - 1) {
            let end = pending.count - k
            if let s = String(bytes: pending[0..<end], encoding: .utf8) {
                pending.removeFirst(end)
                return s.isEmpty ? nil : s
            }
        }
        if pending.count > 8 { return flush() }
        return nil
    }

    mutating func flush() -> String? {
        guard !pending.isEmpty else { return nil }
        let s = String(decoding: pending, as: UTF8.self)
        pending.removeAll()
        return s
    }
}
