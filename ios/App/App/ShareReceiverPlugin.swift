import Foundation
import Capacitor

/// Items handed to Skim from outside, mirroring the Android plugin's contract:
/// - Files opened with Skim ("Open in Skim" for EPUB/PDF) arrive through the
///   scene's URL handler and are copied into the app cache.
/// - Links and files from the Share Extension are dropped into the shared App
///   Group inbox; the app drains it when it becomes active.
/// - `skim://share?url=...` custom-scheme links are accepted too.
@objc(ShareReceiverPlugin)
public class ShareReceiverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareReceiverPlugin"
    public let jsName = "ShareReceiver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingFile", returnType: CAPPluginReturnPromise),
    ]

    static let appGroup = "group.dev.skim.reader"
    static let inboxKey = "shareInbox"

    private struct Pending {
        var path: String?
        var name: String?
        var mimeType: String?
        var url: String?
        var title: String?
    }

    private static var pending: [Pending] = []
    private static weak var instance: ShareReceiverPlugin?

    public override func load() {
        ShareReceiverPlugin.instance = self
        NotificationCenter.default.addObserver(self, selector: #selector(drainInbox), name: UIApplication.didBecomeActiveNotification, object: nil)
        drainInbox()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Called by SceneDelegate after accept(url:) so the web layer drains the queue.
    static func notifyIfPending() {
        DispatchQueue.main.async { instance?.notify() }
    }

    static func accept(url: URL) {
        CAPLog.print("ShareReceiver: accept \(url)")
        if url.isFileURL {
            if let copied = copyIntoCache(url) {
                pending.append(Pending(path: copied.path, name: copied.lastPathComponent, mimeType: mime(for: copied), url: nil, title: nil))
            }
        } else if url.scheme?.lowercased() == "skim" {
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            if let shared = comps?.queryItems?.first(where: { $0.name == "url" })?.value, !shared.isEmpty {
                pending.append(Pending(path: nil, name: nil, mimeType: nil, url: shared, title: comps?.queryItems?.first(where: { $0.name == "title" })?.value))
            }
        } else if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            pending.append(Pending(path: nil, name: nil, mimeType: nil, url: url.absoluteString, title: nil))
        }
    }

    /// Pull whatever the Share Extension left in the App Group.
    @objc private func drainInbox() {
        guard let defaults = UserDefaults(suiteName: ShareReceiverPlugin.appGroup),
              let items = defaults.array(forKey: ShareReceiverPlugin.inboxKey) as? [[String: String]], !items.isEmpty else { return }
        defaults.removeObject(forKey: ShareReceiverPlugin.inboxKey)
        for item in items {
            if let file = item["file"], !file.isEmpty {
                let src = URL(fileURLWithPath: file)
                if let copied = ShareReceiverPlugin.copyIntoCache(src) {
                    ShareReceiverPlugin.pending.append(Pending(path: copied.path, name: item["name"] ?? copied.lastPathComponent, mimeType: ShareReceiverPlugin.mime(for: copied), url: nil, title: nil))
                    try? FileManager.default.removeItem(at: src)
                }
            } else if let url = item["url"], !url.isEmpty {
                ShareReceiverPlugin.pending.append(Pending(path: nil, name: nil, mimeType: nil, url: url, title: item["title"]))
            }
        }
        notify()
    }

    private func notify() {
        if !ShareReceiverPlugin.pending.isEmpty {
            notifyListeners("fileShared", data: [:], retainUntilConsumed: true)
        }
    }

    @objc func getPendingFile(_ call: CAPPluginCall) {
        guard !ShareReceiverPlugin.pending.isEmpty else {
            call.resolve(["path": NSNull()])
            return
        }
        let item = ShareReceiverPlugin.pending.removeFirst()
        var result: [String: Any] = ["path": item.path ?? NSNull()]
        if let name = item.name { result["name"] = name }
        if let mime = item.mimeType { result["mimeType"] = mime }
        if let url = item.url { result["url"] = url }
        if let title = item.title { result["title"] = title }
        call.resolve(result)
    }

    static func copyIntoCache(_ src: URL) -> URL? {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory.appendingPathComponent("shared", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let safeName = src.lastPathComponent.replacingOccurrences(of: "[^A-Za-z0-9._ -]", with: "_", options: .regularExpression)
        let dst = dir.appendingPathComponent("\(Int(Date().timeIntervalSince1970 * 1000))-\(safeName)")
        let scoped = src.startAccessingSecurityScopedResource()
        defer { if scoped { src.stopAccessingSecurityScopedResource() } }
        do {
            try fm.copyItem(at: src, to: dst)
            return dst
        } catch {
            CAPLog.print("ShareReceiver: copy failed \(error)")
            return nil
        }
    }

    static func mime(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "epub": return "application/epub+zip"
        case "pdf": return "application/pdf"
        default: return "application/octet-stream"
        }
    }
}
