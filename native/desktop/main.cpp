#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <wrl.h>
#include <WebView2.h>

#include <cwchar>
#include <filesystem>
#include <string>
#include <utility>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {
constexpr wchar_t WindowClass[] = L"ControlEverything.SessionPanel";
constexpr wchar_t WindowTitle[] = L"Session Panel";

class DesktopWindow {
public:
    DesktopWindow(std::wstring url, std::wstring dataDirectory)
        : url_(std::move(url)), dataDirectory_(std::move(dataDirectory)) {}

    int Run(HINSTANCE instance) {
        WNDCLASSW wc{};
        wc.lpfnWndProc = WindowProc;
        wc.hInstance = instance;
        wc.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(101));
        wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        wc.hbrBackground = GetSysColorBrush(COLOR_WINDOW);
        wc.lpszClassName = WindowClass;
        if (!RegisterClassW(&wc)) {
            return Fail(L"无法创建应用窗口。", HRESULT_FROM_WIN32(GetLastError()));
        }
        hwnd_ = CreateWindowExW(0, WindowClass, L"Session Panel · 正在加载", WS_OVERLAPPEDWINDOW,
                               CW_USEDEFAULT, CW_USEDEFAULT, 1280, 850, nullptr, nullptr, instance, this);
        if (!hwnd_) {
            return Fail(L"无法创建应用窗口。", HRESULT_FROM_WIN32(GetLastError()));
        }
        ShowWindow(hwnd_, SW_SHOWNORMAL);
        UpdateWindow(hwnd_);

        auto completion = Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [this](HRESULT status, ICoreWebView2Environment* environment) -> HRESULT {
                if (!hwnd_) return S_OK;
                if (FAILED(status) || !environment) {
                    Fail(L"无法初始化 WebView2。请确认已安装 Microsoft Edge WebView2 Runtime。", status);
                    return S_OK;
                }
                auto controller = Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [this](HRESULT result, ICoreWebView2Controller* value) -> HRESULT {
                        if (hwnd_) Attach(result, value);
                        return S_OK;
                    });
                const HRESULT created = environment->CreateCoreWebView2Controller(hwnd_, controller.Get());
                if (FAILED(created)) Fail(L"无法创建工作台视图。", created);
                return S_OK;
            });
        const HRESULT status = CreateCoreWebView2EnvironmentWithOptions(
            nullptr, dataDirectory_.c_str(), nullptr, completion.Get());
        if (FAILED(status)) Fail(L"无法初始化 WebView2。请确认已安装 Microsoft Edge WebView2 Runtime。", status);

        MSG message{};
        BOOL read = 0;
        while ((read = GetMessageW(&message, nullptr, 0, 0)) > 0) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        if (hwnd_) DestroyWindow(hwnd_);
        return read < 0 ? 1 : static_cast<int>(message.wParam);
    }

private:
    int Fail(const wchar_t* message, HRESULT status) {
        exitCode_ = 1;
        wchar_t text[512];
        swprintf_s(text, L"%ls\n错误代码 0x%08lX", message, static_cast<unsigned long>(status));
        MessageBoxW(hwnd_, text, WindowTitle, MB_OK | MB_ICONERROR);
        if (hwnd_) DestroyWindow(hwnd_);
        return exitCode_;
    }

    void Attach(HRESULT status, ICoreWebView2Controller* controller) {
        if (FAILED(status) || !controller) {
            Fail(L"无法创建工作台视图。", status);
            return;
        }
        controller_ = controller;
        status = controller_->get_CoreWebView2(webview_.GetAddressOf());
        if (FAILED(status) || !webview_) {
            Fail(L"无法创建工作台视图。", status);
            return;
        }
        ComPtr<ICoreWebView2Settings> settings;
        if (SUCCEEDED(webview_->get_Settings(settings.GetAddressOf()))) {
            settings->put_AreHostObjectsAllowed(FALSE);
        }
        Resize();
        EventRegistrationToken event{};
        status = webview_->add_NavigationCompleted(
            Callback<ICoreWebView2NavigationCompletedEventHandler>(
                [this](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                    if (!hwnd_ || initialNavigationCompleted_) return S_OK;
                    initialNavigationCompleted_ = true;
                    BOOL success = FALSE;
                    args->get_IsSuccess(&success);
                    if (success) SetWindowTextW(hwnd_, WindowTitle);
                    else Fail(L"无法连接本机工作台。", E_FAIL);
                    return S_OK;
                }).Get(), &event);
        if (SUCCEEDED(status)) status = webview_->Navigate(url_.c_str());
        if (FAILED(status)) Fail(L"无法打开本机工作台。", status);
    }

    void Resize() {
        if (!controller_) return;
        RECT bounds{};
        GetClientRect(hwnd_, &bounds);
        controller_->put_Bounds(bounds);
    }

    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
        if (message == WM_NCCREATE) {
            const auto creation = reinterpret_cast<const CREATESTRUCTW*>(lparam);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(creation->lpCreateParams));
        }
        auto* window = reinterpret_cast<DesktopWindow*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        if (window) {
            switch (message) {
            case WM_SIZE:
                window->Resize();
                return 0;
            case WM_SETFOCUS:
                if (window->controller_) window->controller_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                return 0;
            case WM_DESTROY:
                window->hwnd_ = nullptr;
                if (window->controller_) window->controller_->Close();
                window->webview_.Reset();
                window->controller_.Reset();
                PostQuitMessage(window->exitCode_);
                return 0;
            }
        }
        return DefWindowProcW(hwnd, message, wparam, lparam);
    }

    HWND hwnd_ = nullptr;
    int exitCode_ = 0;
    bool initialNavigationCompleted_ = false;
    std::wstring url_;
    std::wstring dataDirectory_;
    ComPtr<ICoreWebView2Controller> controller_;
    ComPtr<ICoreWebView2> webview_;
};
}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    int count = 0;
    auto args = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!args) return 2;
    std::wstring port = count == 3 ? args[1] : L"";
    std::wstring dataDirectory = count == 3 ? args[2] : L"";
    LocalFree(args);
    if (port.empty() || port.size() > 5 || port.find_first_not_of(L"0123456789") != std::wstring::npos ||
        std::wcstoul(port.c_str(), nullptr, 10) == 0 || std::wcstoul(port.c_str(), nullptr, 10) > 65535 ||
        !std::filesystem::path(dataDirectory).is_absolute()) {
        MessageBoxW(nullptr, L"启动参数无效。请从 Session Panel 的启动入口打开。", WindowTitle, MB_OK | MB_ICONERROR);
        return 2;
    }
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    const HRESULT initialized = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(initialized)) return 1;
    DesktopWindow window(L"http://127.0.0.1:" + port + L"/studio", std::move(dataDirectory));
    const int result = window.Run(instance);
    CoUninitialize();
    return result;
}
