import Foundation
import UIKit

/// GGUF 모델 파일 다운로드/보관. Application Support/models/<id>/ 아래에 저장하고 iCloud 백업에서 제외합니다.
final class ModelStore: NSObject, URLSessionDownloadDelegate {
    static let shared = ModelStore()

    struct Job {
        let id: String
        var files: [(url: URL, name: String)]
        var index: Int
        let completion: (Error?) -> Void
    }

    /// (id, fileIndex, fileCount, received, total)
    var onProgress: ((String, Int, Int, Int64, Int64) -> Void)?

    private var session: URLSession!
    private var jobs: [String: Job] = [:]
    private var taskToJob: [Int: String] = [:]
    private let lock = NSLock()
    private var lastEmit: [String: TimeInterval] = [:]

    private override init() {
        super.init()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 120
        cfg.timeoutIntervalForResource = 6 * 60 * 60
        cfg.waitsForConnectivity = true
        session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }

    static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var url = base.appendingPathComponent("models", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return url
    }

    func dir(_ id: String) -> URL { Self.root.appendingPathComponent(id, isDirectory: true) }
    private func marker(_ id: String) -> URL { dir(id).appendingPathComponent(".complete") }

    /// 앱 설치 파일에 들어 있는 기본 모델 폴더(BundledModels/<id>)
    func bundledDir(_ id: String) -> URL? {
        guard let base = Bundle.main.resourceURL?.appendingPathComponent("BundledModels/\(id)", isDirectory: true) else { return nil }
        let items = (try? FileManager.default.contentsOfDirectory(atPath: base.path)) ?? []
        return items.contains { $0.hasSuffix(".gguf") } ? base : nil
    }

    func isBundled(_ id: String) -> Bool { bundledDir(id) != nil }

    func file(_ id: String, _ name: String) -> URL {
        if let b = bundledDir(id), FileManager.default.fileExists(atPath: b.appendingPathComponent(name).path) {
            return b.appendingPathComponent(name)
        }
        return dir(id).appendingPathComponent(name)
    }

    func isComplete(_ id: String) -> Bool {
        isBundled(id) || FileManager.default.fileExists(atPath: marker(id).path)
    }

    func isDownloading(_ id: String) -> Bool { lock.lock(); defer { lock.unlock() }; return jobs[id] != nil }

    func bytesOnDisk(_ id: String) -> Int64 {
        guard let items = try? FileManager.default.contentsOfDirectory(at: dir(id), includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        return items.reduce(0) { $0 + Int64((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
    }

    static var freeBytes: Int64 {
        let values = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage ?? 0
    }

    func delete(_ id: String) {
        if isBundled(id) { return }   // 내장 모델은 앱 일부라 지울 수 없음
        cancel(id)
        try? FileManager.default.removeItem(at: dir(id))
    }

    func download(id: String, files: [(url: URL, name: String)], completion: @escaping (Error?) -> Void) {
        lock.lock()
        if jobs[id] != nil { lock.unlock(); completion(LlamaError("이미 내려받는 중입니다.")); return }
        jobs[id] = Job(id: id, files: files, index: 0, completion: completion)
        lock.unlock()
        try? FileManager.default.createDirectory(at: dir(id), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: marker(id))
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
        startNext(id)
    }

    func cancel(_ id: String) {
        lock.lock()
        let job = jobs.removeValue(forKey: id)
        let taskIds = taskToJob.filter { $0.value == id }.map { $0.key }
        taskIds.forEach { taskToJob.removeValue(forKey: $0) }
        lock.unlock()
        session.getAllTasks { tasks in tasks.filter { taskIds.contains($0.taskIdentifier) }.forEach { $0.cancel() } }
        job?.completion(LlamaError("다운로드를 취소했습니다."))
        refreshIdleTimer()
    }

    private func startNext(_ id: String) {
        lock.lock()
        guard let job = jobs[id] else { lock.unlock(); return }
        if job.index >= job.files.count {
            jobs.removeValue(forKey: id)
            lock.unlock()
            FileManager.default.createFile(atPath: marker(id).path, contents: Data())
            refreshIdleTimer()
            job.completion(nil)
            return
        }
        let entry = job.files[job.index]
        lock.unlock()
        if FileManager.default.fileExists(atPath: file(id, entry.name).path) {
            advance(id)
            return
        }
        let task = session.downloadTask(with: entry.url)
        lock.lock(); taskToJob[task.taskIdentifier] = id; lock.unlock()
        task.resume()
    }

    private func advance(_ id: String) {
        lock.lock(); jobs[id]?.index += 1; lock.unlock()
        startNext(id)
    }

    private func fail(_ id: String, _ error: Error) {
        lock.lock(); let job = jobs.removeValue(forKey: id); lock.unlock()
        refreshIdleTimer()
        job?.completion(error)
    }

    private func refreshIdleTimer() {
        lock.lock(); let busy = !jobs.isEmpty; lock.unlock()
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = busy }
    }

    // MARK: URLSessionDownloadDelegate

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        lock.lock()
        guard let id = taskToJob[downloadTask.taskIdentifier], let job = jobs[id] else { lock.unlock(); return }
        let now = Date().timeIntervalSince1970
        let due = now - (lastEmit[id] ?? 0) > 0.25
        if due { lastEmit[id] = now }
        lock.unlock()
        if due { onProgress?(id, job.index, job.files.count, totalBytesWritten, totalBytesExpectedToWrite) }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        lock.lock()
        guard let id = taskToJob[downloadTask.taskIdentifier], let job = jobs[id] else { lock.unlock(); return }
        let entry = job.files[job.index]
        lock.unlock()
        if let http = downloadTask.response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            fail(id, LlamaError("다운로드 실패(HTTP \(http.statusCode)). 잠시 후 다시 시도하세요."))
            return
        }
        do {
            let dest = file(id, entry.name)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: location, to: dest)
        } catch {
            fail(id, LlamaError("저장 공간이 부족하거나 파일을 저장할 수 없습니다."))
            return
        }
        lock.lock(); taskToJob.removeValue(forKey: downloadTask.taskIdentifier); lock.unlock()
        advance(id)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error else { return }
        lock.lock()
        let id = taskToJob.removeValue(forKey: task.taskIdentifier)
        lock.unlock()
        if let id, (error as NSError).code != NSURLErrorCancelled {
            fail(id, LlamaError("네트워크 오류로 다운로드가 중단됐습니다: \(error.localizedDescription)"))
        }
    }
}
