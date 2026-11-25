import Cocoa
import WebKit

final class WindowHost: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let origin: URL
    let smokeReport: URL?
    var smokeResult: [String: Any] = ["status": "failed", "reason": "window_not_loaded"]
    var windowClosed = false

    init(origin: URL, smokeReport: URL?) {
        self.origin = origin
        self.smokeReport = smokeReport
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Session Panel", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let item = NSMenuItem()
        item.submenu = appMenu
        menu.addItem(item)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let editItem = NSMenuItem()
        editItem.submenu = edit
        menu.addItem(editItem)
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 850),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Session Panel"
        window.minSize = NSSize(width: 720, height: 500)
        window.contentView = web
        window.delegate = self
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: origin.appendingPathComponent("studio")))
        if smokeReport != nil {
            Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { _ in
                self.smokeResult = ["status": "failed", "reason": "window_load_timeout"]
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func windowWillClose(_ notification: Notification) { windowClosed = true }

    func applicationWillTerminate(_ notification: Notification) {
        guard let report = smokeReport else { return }
        smokeResult["windowClosed"] = windowClosed
        if !windowClosed { smokeResult["status"] = "failed" }
        do {
            try JSONSerialization.data(withJSONObject: smokeResult, options: [.prettyPrinted, .sortedKeys]).write(to: report)
        } catch {
            fputs("window_smoke_report_failed\n", stderr)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smokeReport != nil else { return }
        webView.evaluateJavaScript("JSON.stringify({path:location.pathname,ready:document.readyState,title:document.title,content:document.body.innerText.length})") { value, error in
            guard error == nil, let text = value as? String, let data = text.data(using: .utf8),
                  let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  page["path"] as? String == "/studio", page["ready"] as? String == "complete",
                  let content = page["content"] as? Int, content > 0 else {
                self.smokeResult = ["status": "failed", "reason": "studio_startup_page_invalid"]
                self.window.performClose(nil)
                return
            }
            self.smokeResult = ["status": "passed", "startupPath": "/studio", "title": page["title"] ?? ""]
            self.window.performClose(nil)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if smokeReport != nil {
            smokeResult = ["status": "failed", "reason": "studio_navigation_failed"]
            window.performClose(nil)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if smokeReport != nil && response.isForMainFrame,
           (response.response as? HTTPURLResponse)?.statusCode != 200 {
            smokeResult = ["status": "failed", "reason": "studio_http_response_invalid"]
            decisionHandler(.cancel)
            window.performClose(nil)
            return
        }
        decisionHandler(.allow)
    }

    func local(_ url: URL) -> Bool {
        url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    func external(_ url: URL) {
        if ["https", "http", "mailto"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if local(url) || action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
        } else {
            if action.navigationType == .linkActivated { external(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if local(url) { web.load(URLRequest(url: url)) } else { external(url) }
        }
        return nil
    }
}

guard CommandLine.arguments.count >= 2, let port = Int(CommandLine.arguments[1]),
      (1...65535).contains(port), let origin = URL(string: "http://127.0.0.1:\(port)") else { exit(2) }
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let smokeIndex = CommandLine.arguments.firstIndex(of: "--smoke-report")
let smokeReport = smokeIndex.flatMap { index in
    index + 1 < CommandLine.arguments.count ? URL(fileURLWithPath: CommandLine.arguments[index + 1]) : nil
}
let host = WindowHost(origin: origin, smokeReport: smokeReport)
app.delegate = host
app.run()
