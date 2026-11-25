"""macOS application assembly using the bundled workbench and local HTTP server."""

import argparse
import json
from pathlib import Path
import sys
import threading
from urllib.request import urlopen

from control_everything.http.desktop import Desktop
from control_everything.http.gateway import build_profile_server
from control_everything.http.workbench import WorkbenchAssets
from control_everything.integrations.workbench_runtime import RuntimeConfig, WorkbenchRuntime, safe_path


def build_desktop(product_root, data_dir=None, port=8766):
    root = safe_path(product_root)
    engine, build = root / 'workbench-engine', root / 'build'
    selected = data_dir or Path.home() / 'Library/Application Support/Session Panel'
    server = build_profile_server(selected, port)
    try:
        runtime = WorkbenchRuntime(RuntimeConfig(engine, build, server.profile.data_dir / 'workbench',
                                                 Path('/usr/bin/git'), (), inherit_host_environment=True))
        server.workbench_assets = WorkbenchAssets(engine / 'out/web', build / 'web-assets.json')
        window_host = Path(sys.executable).parent / 'session-panel-window' if getattr(sys, 'frozen', False) else None
        desktop = Desktop(server, runtime, window_host=window_host)
        desktop.refresh_workspace_roots()
        return desktop
    except BaseException:
        server.server_close()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    default_root = (Path(sys.executable).parent.parent / 'Resources/session-panel').resolve() if getattr(sys, 'frozen', False) else None
    parser.add_argument('--product-root', type=Path, default=default_root, required=default_root is None)
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--smoke', action='store_true')
    parser.add_argument('--smoke-report', type=Path)
    args = parser.parse_args(argv)
    if sys.platform != 'darwin':
        parser.error('macOS is required')
    desktop = build_desktop(args.product_root, args.data_dir, args.port)
    report = {}
    try:
        desktop.start()
        if args.smoke:
            worker = threading.Thread(target=desktop.server.serve_forever, name='macos-smoke-http')
            worker.start()
            try:
                pages = {}
                for route in ('/workspace', '/workbench'):
                    with urlopen(desktop.server.local_origin + route, timeout=10) as response:
                        pages[route] = response.status
                        if response.status != 200 or not response.read():
                            raise ValueError('macos_smoke_page_failed')
                repos = desktop.runtime._rpc('repo.list', {})
                if not isinstance(repos.get('repos'), list):
                    raise ValueError('macos_smoke_owner_failed')
                from control_everything.http.macos_smoke import smoke_terminal
                terminal = smoke_terminal(desktop)
                report = {'runtime': desktop.runtime.status(), 'pages': pages, 'ownerRpc': 'repo.list', **terminal}
            finally:
                desktop.server.shutdown()
                worker.join()
            return
        print(f'本机电脑绑定：{desktop.server.local_origin}/desktop', flush=True)
        desktop.serve(headless=args.headless)
    except KeyboardInterrupt:
        pass
    finally:
        desktop.close()
        if args.smoke and report:
            report['cleanupVerified'] = desktop.runtime.cleanup_verified
            report['status'] = 'passed'
            if args.smoke_report:
                args.smoke_report.parent.mkdir(parents=True, exist_ok=True)
                args.smoke_report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
