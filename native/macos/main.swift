import Cocoa
import WebKit

let smokeDiagnosticsScript = #"""
(() => {
  const state = {scriptErrors: 0, errorKinds: [], unhandledRejections: 0, resourceErrors: 0, failedResourcePaths: []};
  Object.defineProperty(window, '__ceWindowSmoke', {value: state});
  addEventListener('error', event => {
    if (event instanceof ErrorEvent) {
      state.scriptErrors++;
      const name = event.error && event.error.name;
      const kind = ['SyntaxError', 'TypeError', 'ReferenceError', 'RangeError', 'Error'].includes(name) ? name : 'UnknownError';
      if (!state.errorKinds.includes(kind)) state.errorKinds.push(kind);
    } else if (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement) {
      state.resourceErrors++;
      try {
        const url = new URL(event.target.src || event.target.href, location.href);
        if (url.origin === location.origin && state.failedResourcePaths.length < 8)
          state.failedResourcePaths.push(url.pathname.slice(0, 160));
      } catch {}
    }
  }, true);
  addEventListener('unhandledrejection', () => { state.unhandledRejections++; });
})();
"""#

let smokePageProbe = #"""
(() => {
  const visible = element => {
    if (!element || element.hidden || element.closest('[hidden],[inert]')) return false;
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
      box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 &&
      box.top < innerHeight && box.left < innerWidth;
  };
  const root = document.getElementById('root');
  const surface = document.querySelector('.platform-studio-surface');
  const host = surface && surface.querySelector('.platform-studio-host');
  const studio = host && host.shadowRoot && host.shadowRoot.querySelector('#ce-studio');
  const search = studio && studio.querySelector('#studio-project-search');
  const surfaceVisible = visible(surface) && visible(host);
  const projectSearchVisible = surfaceVisible && visible(search) && !search.disabled;
  const filterCount = studio ? [...studio.querySelectorAll('[data-action="active-projects"],[data-action="all-projects"]')]
    .filter(element => visible(element) && !element.disabled).length : 0;
  const activeNavigationVisible = surfaceVisible && visible(studio && studio.querySelector('#studio-rail [aria-current="page"]'));
  const alerts = [...document.querySelectorAll('.platform-surface-feedback[role="alert"]'),
    ...(studio ? studio.querySelectorAll('[role="alert"]') : [])].filter(visible).length;
  if (projectSearchVisible) search.focus();
  const searchFocused = !!(host && host.shadowRoot && host.shadowRoot.activeElement === search);
  const diagnostics = window.__ceWindowSmoke || {scriptErrors: 0, unhandledRejections: 0, resourceErrors: 0};
  const sameOriginResources = performance.getEntriesByType('resource').filter(entry => {
    try { return new URL(entry.name, location.href).origin === location.origin; } catch { return false; }
  }).length;
  const ready = location.pathname === '/studio' && document.readyState === 'complete' &&
    projectSearchVisible && searchFocused;
  return JSON.stringify({ready, pathname: location.pathname, readyState: document.readyState,
    rootChildren: root ? root.childElementCount : 0, studioMounted: !!studio, surfaceVisible,
    projectSearchVisible, searchFocused, filterCount, activeNavigationVisible, visibleAlerts: alerts,
    scriptCount: document.scripts.length, sameOriginResources, ...diagnostics});
})();
"""#

final class WindowHost: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let origin: URL
    let smokeReport: URL?
    var smokeResult: [String: Any] = ["status": "failed", "reason": "window_not_loaded"]
    var windowClosed = false
    var smokeDeadline: Date?
    var smokeTimer: Timer?
    var probing = false
    var smokeFinished = false
    var lastPage: [String: Any] = [:]

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
        if smokeReport != nil {
            config.userContentController.addUserScript(WKUserScript(source: smokeDiagnosticsScript,
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
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
            smokeDeadline = Date().addingTimeInterval(30)
            smokeTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
                self.probeStudio()
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func windowWillClose(_ notification: Notification) { windowClosed = true }

    func applicationWillTerminate(_ notification: Notification) {
        guard let report = smokeReport else { return }
        smokeTimer?.invalidate()
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
        probeStudio()
    }

    func finishSmoke(reason: String?) {
        guard !smokeFinished else { return }
        smokeFinished = true
        smokeTimer?.invalidate()
        smokeResult = ["status": reason == nil ? "passed" : "failed", "startupPath": "/studio", "page": lastPage]
        if let reason = reason { smokeResult["reason"] = reason }
        window.performClose(nil)
    }

    func probeStudio() {
        guard smokeReport != nil && !smokeFinished else { return }
        if probing {
            if let deadline = smokeDeadline, Date() >= deadline { finishSmoke(reason: "studio_probe_timeout") }
            return
        }
        probing = true
        web.evaluateJavaScript(smokePageProbe) { value, error in
            self.probing = false
            guard error == nil, let text = value as? String, let data = text.data(using: .utf8),
                  let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.lastPage = ["evaluationFailed": true, "errorCode": (error as NSError?)?.code ?? 0]
                self.finishSmoke(reason: "studio_probe_evaluation_failed")
                return
            }
            self.lastPage = page
            if page["ready"] as? Bool == true {
                self.finishSmoke(reason: nil)
            } else if let deadline = self.smokeDeadline, Date() >= deadline {
                let scriptError = (page["scriptErrors"] as? Int ?? 0) + (page["unhandledRejections"] as? Int ?? 0)
                let reason = scriptError > 0 ? "studio_javascript_failed" :
                    (page["resourceErrors"] as? Int ?? 0) > 0 ? "studio_resource_failed" :
                    (page["visibleAlerts"] as? Int ?? 0) > 0 ? "studio_application_error" : "studio_mount_timeout"
                self.finishSmoke(reason: reason)
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if smokeReport != nil {
            lastPage = ["navigationErrorCode": (error as NSError).code]
            finishSmoke(reason: "studio_navigation_failed")
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if smokeReport != nil {
            lastPage = ["navigationErrorCode": (error as NSError).code]
            finishSmoke(reason: "studio_navigation_failed")
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if smokeReport != nil { finishSmoke(reason: "studio_web_process_terminated") }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if smokeReport != nil && response.isForMainFrame,
           (response.response as? HTTPURLResponse)?.statusCode != 200 {
            decisionHandler(.cancel)
            lastPage = ["httpStatus": (response.response as? HTTPURLResponse)?.statusCode ?? 0]
            finishSmoke(reason: "studio_http_response_invalid")
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
