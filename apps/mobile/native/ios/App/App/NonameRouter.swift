import Capacitor
import Foundation

/// Serve the complete installed game; Documents is reserved for exported data.
class NonameRouter: NSObject, Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        return path.isEmpty || path == "/" ? basePath + "/index.html" : basePath + path
    }
}
