import Capacitor
import Foundation

/// Serve the complete installed game; Documents is reserved for exported data.
class NonameRouter: NSObject, Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        guard let normalized = Self.normalize(path) else { return basePath + "/__invalid_path__" }
        let root = URL(fileURLWithPath: basePath).resolvingSymlinksInPath()
        let target = root.appendingPathComponent(normalized.isEmpty ? "index.html" : normalized).resolvingSymlinksInPath()
        guard target.path.hasPrefix(root.path + "/") else { return basePath + "/__invalid_path__" }
        return target.path
    }

    static func normalize(_ path: String) -> String? {
        guard let decoded = path.removingPercentEncoding,
              !decoded.contains("\0"), !decoded.contains(":") else { return nil }
        let parts = decoded.replacingOccurrences(of: "\\", with: "/").split(separator: "/")
        guard !parts.contains("..") else { return nil }
        return parts.filter { $0 != "." }.joined(separator: "/")
    }
}
