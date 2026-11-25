"""macOS application assembly using the bundled workbench and local HTTP server."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import threading
from urllib.request import urlopen

from control_everything.http.desktop import Desktop, _news_runtime
from control_everything.http.gateway import APP, build_profile_server
from control_everything.http.workbench import WorkbenchAssets
from control_everything.integrations.workbench_runtime import RuntimeConfig, WorkbenchRuntime, safe_path, read_json, digest


def news_runtime(root):
    engine, build = root / 'workbench-engine', root / 'build'
    if read_json(build / 'build-provenance.json').get('status') != 'build_only_verified':
        raise ValueError('news_runtime_build_unverified')
    rows = read_json(build / 'output-manifest.json')['files']
    selected = []
    for row in rows:
        name = row['path']
        if not name.startswith(('out/runtimes/', 'out/node_modules/playwright-core/', 'out/orcad/.runtime-node')):
            continue
        path = safe_path(engine / name)
        if not path.is_relative_to(engine) or digest(path) != row['sha256']:
            raise ValueError('news_runtime_build_changed')
        selected.append({**row, 'path': 'workbench-engine/' + name})
    result = _news_runtime(root, 'workbench-engine', selected, node_executable='bin/node')
    if not result:
        raise ValueError('news_runtime_payload_missing')
    return result


def build_desktop(product_root, data_dir=None, port=8766):
    root = safe_path(product_root)
    engine, build = root / 'workbench-engine', root / 'build'
    selected = data_dir or Path.home() / 'Library/Application Support/Session Panel'
    server = build_profile_server(selected, port, news_runtime=news_runtime(root))
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


def smoke_window(desktop, report_path):
    if desktop.window_host is None:
        raise ValueError('macos_smoke_window_host_missing')
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.unlink(missing_ok=True)
    subprocess.run([desktop.window_host, str(desktop.server.server_port), '--smoke-report', report_path],
                   check=True, timeout=45)
    result = read_json(report_path, 65536)
    if (result.get('status') != 'passed' or result.get('startupPath') != '/studio'
            or result.get('windowClosed') is not True):
        raise ValueError('macos_smoke_window_failed')
    return result


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
                for route in ('/health', '/studio'):
                    with urlopen(desktop.server.local_origin + route, timeout=10) as response:
                        pages[route] = response.status
                        body = response.read()
                        if response.status != 200 or not body:
                            raise ValueError('macos_smoke_page_failed')
                        if route == '/health':
                            if json.loads(body) != {'app': APP, 'protocol_version': 1}:
                                raise ValueError('macos_smoke_health_failed')
                        elif (response.headers.get_content_type() != 'text/html' or
                              b'<html' not in body.lower() or b'<script' not in body.lower()):
                            raise ValueError('macos_smoke_studio_failed')
                repos = desktop.runtime._rpc('repo.list', {})
                if not isinstance(repos.get('repos'), list):
                    raise ValueError('macos_smoke_owner_failed')
                from control_everything.http.macos_smoke import smoke_terminal
                terminal = smoke_terminal(desktop)
                output = args.smoke_report or desktop.server.profile.data_dir / 'macos-smoke.json'
                window = smoke_window(desktop, output.with_suffix('.window.json'))
                report = {'runtime': desktop.runtime.status(), 'pages': pages, 'ownerRpc': 'repo.list',
                          'window': window, **terminal}
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
