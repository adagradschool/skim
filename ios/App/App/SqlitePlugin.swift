import Foundation
import Capacitor
import SQLite3

/// A thin SQL transport over the system SQLite, mirroring the Android plugin.
/// The database lives in Application Support, which iCloud backs up and which
/// WKWebView's storage management never touches. Schema and logic live on the
/// web side (SqliteStorage.ts); this only moves SQL and rows.
@objc(SqlitePlugin)
public class SqlitePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SqlitePlugin"
    public let jsName = "Sqlite"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "batch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "query", returnType: CAPPluginReturnPromise),
    ]

    private static let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "dev.skim.reader.sqlite")

    private func open() throws -> OpaquePointer {
        if let db = db { return db }
        let fm = FileManager.default
        let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let path = dir.appendingPathComponent("skim.db").path
        var handle: OpaquePointer?
        guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK, let h = handle else {
            throw NSError(domain: "Sqlite", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not open database"])
        }
        sqlite3_exec(h, "PRAGMA journal_mode=WAL;", nil, nil, nil)
        // Keep the library out of iCloud *document* sync but inside device backups.
        var url = URL(fileURLWithPath: path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = false
        try? url.setResourceValues(values)
        db = h
        return h
    }

    @objc func run(_ call: CAPPluginCall) {
        guard let sql = call.getString("sql") else { call.reject("sql is required"); return }
        let params = call.getArray("params") ?? []
        queue.async {
            do {
                let h = try self.open()
                try self.exec(h, sql: sql, params: params)
                call.resolve()
            } catch {
                call.reject("SQL failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func batch(_ call: CAPPluginCall) {
        guard let statements = call.getArray("statements") as? [[String: Any]] else { call.reject("statements is required"); return }
        queue.async {
            do {
                let h = try self.open()
                guard sqlite3_exec(h, "BEGIN IMMEDIATE", nil, nil, nil) == SQLITE_OK else { throw self.lastError(h) }
                do {
                    for st in statements {
                        guard let sql = st["sql"] as? String else { continue }
                        try self.exec(h, sql: sql, params: (st["params"] as? [Any]) ?? [])
                    }
                    sqlite3_exec(h, "COMMIT", nil, nil, nil)
                    call.resolve()
                } catch {
                    sqlite3_exec(h, "ROLLBACK", nil, nil, nil)
                    throw error
                }
            } catch {
                call.reject("Batch failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func query(_ call: CAPPluginCall) {
        guard let sql = call.getString("sql") else { call.reject("sql is required"); return }
        let params = call.getArray("params") ?? []
        queue.async {
            do {
                let h = try self.open()
                var stmt: OpaquePointer?
                guard sqlite3_prepare_v2(h, sql, -1, &stmt, nil) == SQLITE_OK, let s = stmt else { throw self.lastError(h) }
                defer { sqlite3_finalize(s) }
                try self.bind(s, params: params, db: h)
                var rows: [[String: Any]] = []
                let count = sqlite3_column_count(s)
                while true {
                    let rc = sqlite3_step(s)
                    if rc == SQLITE_ROW {
                        var row: [String: Any] = [:]
                        for i in 0..<count {
                            let name = String(cString: sqlite3_column_name(s, i))
                            switch sqlite3_column_type(s, i) {
                            case SQLITE_INTEGER: row[name] = sqlite3_column_int64(s, i)
                            case SQLITE_FLOAT: row[name] = sqlite3_column_double(s, i)
                            case SQLITE_NULL: row[name] = NSNull()
                            default:
                                if let text = sqlite3_column_text(s, i) { row[name] = String(cString: text) } else { row[name] = NSNull() }
                            }
                        }
                        rows.append(row)
                    } else if rc == SQLITE_DONE {
                        break
                    } else {
                        throw self.lastError(h)
                    }
                }
                call.resolve(["rows": rows])
            } catch {
                call.reject("Query failed: \(error.localizedDescription)")
            }
        }
    }

    private func exec(_ h: OpaquePointer, sql: String, params: [Any]) throws {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(h, sql, -1, &stmt, nil) == SQLITE_OK, let s = stmt else { throw lastError(h) }
        defer { sqlite3_finalize(s) }
        try bind(s, params: params, db: h)
        let rc = sqlite3_step(s)
        guard rc == SQLITE_DONE || rc == SQLITE_ROW else { throw lastError(h) }
    }

    private func bind(_ s: OpaquePointer, params: [Any], db: OpaquePointer) throws {
        for (i, v) in params.enumerated() {
            let idx = Int32(i + 1)
            let rc: Int32
            switch v {
            case is NSNull: rc = sqlite3_bind_null(s, idx)
            case let b as Bool: rc = sqlite3_bind_int64(s, idx, b ? 1 : 0)
            case let n as Int: rc = sqlite3_bind_int64(s, idx, Int64(n))
            case let n as Int64: rc = sqlite3_bind_int64(s, idx, n)
            case let n as Double:
                if n == n.rounded() && abs(n) < 9.0e15 { rc = sqlite3_bind_int64(s, idx, Int64(n)) } else { rc = sqlite3_bind_double(s, idx, n) }
            case let n as NSNumber:
                let d = n.doubleValue
                if d == d.rounded() && abs(d) < 9.0e15 { rc = sqlite3_bind_int64(s, idx, n.int64Value) } else { rc = sqlite3_bind_double(s, idx, d) }
            case let str as String: rc = sqlite3_bind_text(s, idx, str, -1, SqlitePlugin.SQLITE_TRANSIENT)
            default: rc = sqlite3_bind_text(s, idx, String(describing: v), -1, SqlitePlugin.SQLITE_TRANSIENT)
            }
            guard rc == SQLITE_OK else { throw lastError(db) }
        }
    }

    private func lastError(_ h: OpaquePointer) -> NSError {
        let msg = String(cString: sqlite3_errmsg(h))
        return NSError(domain: "Sqlite", code: Int(sqlite3_errcode(h)), userInfo: [NSLocalizedDescriptionKey: msg])
    }
}
