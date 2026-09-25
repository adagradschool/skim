import UIKit
import UniformTypeIdentifiers

/// "Share to Skim" from Safari and other apps. No UI of its own: it copies
/// the shared link or file into the App Group inbox and finishes. The app
/// drains the inbox the next time it becomes active.
class ShareViewController: UIViewController {
    private let appGroup = "group.dev.skim.reader"
    private let inboxKey = "shareInbox"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handle()
    }

    private func handle() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return finish() }
        let attachments = items.flatMap { $0.attachments ?? [] }
        let title = items.first?.attributedContentText?.string
        let group = DispatchGroup()
        var entries: [[String: String]] = []
        let lock = NSLock()
        let add: ([String: String]) -> Void = { e in lock.lock(); entries.append(e); lock.unlock() }

        for provider in attachments {
            if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) || provider.hasItemConformingToTypeIdentifier("org.idpf.epub-container") || provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                group.enter()
                let type = provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) ? UTType.pdf.identifier
                    : provider.hasItemConformingToTypeIdentifier("org.idpf.epub-container") ? "org.idpf.epub-container" : UTType.fileURL.identifier
                provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                    defer { group.leave() }
                    guard let url = url, let dst = self.copyToGroup(url) else { return }
                    add(["file": dst.path, "name": url.lastPathComponent])
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let url = item as? URL, !url.isFileURL { add(["url": url.absoluteString, "title": title ?? ""]) }
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                group.enter()
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                    defer { group.leave() }
                    if let text = item as? String, let range = text.range(of: #"https?://[^\s<>"')\]]+"#, options: .regularExpression) {
                        add(["url": String(text[range]), "title": title ?? ""])
                    }
                }
            }
        }

        group.notify(queue: .main) {
            if !entries.isEmpty, let defaults = UserDefaults(suiteName: self.appGroup) {
                var existing = (defaults.array(forKey: self.inboxKey) as? [[String: String]]) ?? []
                existing.append(contentsOf: entries)
                defaults.set(existing, forKey: self.inboxKey)
            }
            self.finish()
        }
    }

    private func copyToGroup(_ src: URL) -> URL? {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let dir = container.appendingPathComponent("inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dst = dir.appendingPathComponent("\(Int(Date().timeIntervalSince1970 * 1000))-\(src.lastPathComponent)")
        do {
            try FileManager.default.copyItem(at: src, to: dst)
            return dst
        } catch {
            return nil
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
