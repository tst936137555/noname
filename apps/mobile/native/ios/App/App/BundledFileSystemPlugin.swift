import Capacitor
import Foundation
import UIKit

/// 直接查询 App 包内 public/，不依赖构建时生成的资源清单。
@objc(BundledFileSystemPlugin)
public class BundledFileSystemPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BundledFileSystemPlugin"
    public let jsName = "BundledFileSystem"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "stat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readdir", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise)
    ]

    @objc func openExternal(_ call: CAPPluginCall) {
        guard let text = call.getString("url"), let url = URL(string: text),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            call.reject("无效的外部链接"); return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { success in
                if success { call.resolve() } else { call.reject("无法打开外部链接") }
            }
        }
    }

    @objc func shareExport(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let normalized = NonameRouter.normalize(path),
              normalized.hasPrefix("export/"),
              let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("无效的导出路径"); return
        }
        let url = root.appendingPathComponent(normalized).resolvingSymlinksInPath()
        guard url.path.hasPrefix(root.resolvingSymlinksInPath().path + "/export/"),
              FileManager.default.fileExists(atPath: url.path) else { call.reject("导出文件不存在"); return }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else { call.reject("无法打开分享面板"); return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = controller.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
            sheet.completionWithItemsHandler = { _, _, _, error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            }
            controller.present(sheet, animated: true)
        }
    }

    @objc func stat(_ call: CAPPluginCall) {
        do {
            let url = try resourceURL(call)
            do {
                let values = try url.resourceValues(forKeys: [.isDirectoryKey])
                call.resolve(["type": values.isDirectory == true ? "directory" : "file"])
            } catch let error as NSError where error.domain == NSCocoaErrorDomain &&
                (error.code == NSFileReadNoSuchFileError || error.code == NSFileNoSuchFileError) {
                call.resolve(["type": "none"])
            }
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func readdir(_ call: CAPPluginCall) {
        do {
            let url = try resourceURL(call)
            let entries = try FileManager.default.contentsOfDirectory(
                at: url, includingPropertiesForKeys: [.isDirectoryKey]
            )
            var folders: [String] = []
            var files: [String] = []
            for entry in entries {
                let values = try entry.resourceValues(forKeys: [.isDirectoryKey])
                if values.isDirectory == true {
                    folders.append(entry.lastPathComponent)
                } else {
                    files.append(entry.lastPathComponent)
                }
            }
            call.resolve(["folders": folders.sorted(), "files": files.sorted()])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    private func resourceURL(_ call: CAPPluginCall) throws -> URL {
        guard let path = call.getString("path"),
              let normalized = NonameRouter.normalize(path),
              let resources = Bundle.main.resourceURL else {
            throw NSError(domain: "BundledFileSystem", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "无效的内置资源路径"])
        }
        let root = resources.appendingPathComponent("public", isDirectory: true).resolvingSymlinksInPath()
        let url = root.appendingPathComponent(normalized).resolvingSymlinksInPath()
        // 同时限制符号链接目标，避免查询 public/ 之外的路径。
        guard url.path == root.path || url.path.hasPrefix(root.path + "/") else {
            throw NSError(domain: "BundledFileSystem", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "内置资源路径越界"])
        }
        return url
    }
}
