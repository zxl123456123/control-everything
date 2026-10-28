"""Installed desktop assembly: one local server, one owned runtime, one connector."""

import argparse
from dataclasses import replace
from pathlib import Path
import re
import threading
import webbrowser
from urllib.parse import urlsplit

from control_everything.http.gateway import build_profile_server
from control_everything.http.workbench import WorkbenchAssets
from control_everything.installation import manifest
from control_everything.integrations.remote_connector import ConnectorConfig, ConnectorStore, RemoteConnector, ConnectorError
from control_everything.integrations.remote_account import RemoteAccount
from control_everything.integrations.workbench_runtime import RuntimeConfig, WorkbenchRuntime, WorkbenchUnavailable, safe_path


class Desktop:
    def __init__(self, server, runtime, connector=None, account=None):
        self.server, self.runtime, self.connector = server, runtime, connector
        self._stop = threading.Event()
        self._worker = None
        self.restart_required = False
        server.attach_workbench_runtime(runtime)
        server.remote_connector = connector
        server.desktop_account = account
        server.desktop = self
        server.refresh_workspace_roots = self.refresh_workspace_roots

    def refresh_workspace_roots(self):
        roots = []
        for project in self.server.workspace.registered_projects():
            if project.get('archived') or project.get('binding_available') is False:
                continue
            for directory in project.get('directories', []):
                if directory.get('id') == 'main':
                    path = safe_path(directory['path'])
                    if path.is_dir():
                        roots.append(path)
        self.runtime.config = replace(self.runtime.config, allowed_workspace_roots=tuple(roots))

    def configure_runtime(self):
        access = self.connector.remote_access if self.connector else None
        identity = self.connector.health_identity if access else None
        config = replace(self.runtime.config, public_origin=access.public_origin if access else None,
                         device_proof=access.proxy_secret if access else None,
                         remote_device_id=identity['device_id'] if identity else None,
                         remote_generation=identity['generation'] if identity else None,
                         platform_installation_id=identity['platform_installation_id'] if identity else None)
        if config == self.runtime.config:
            return True
        if self.runtime.ready:
            # A managed stop may retire the manager before reporting daemon busy.
            # Save the new binding for the next launch without probing live work.
            self.restart_required = True
            return False
        self.runtime.config = config
        return True

    def start(self):
        if self.connector:
            try:
                self.connector.prepare_access()
            except (ConnectorError, OSError, ValueError):
                # Local work and explicit recovery remain available without a tunnel.
                pass
        self.configure_runtime()
        self.runtime.start(self.server.local_origin)
        if self.connector:
            try:
                self.connector.resume_revocation_cleanup()
            except ConnectorError:
                pass
            self._worker = threading.Thread(target=self._run, name='desktop-remote', daemon=True)
            self._worker.start()

    def tick(self):
        if not self.connector or self.restart_required:
            return
        try:
            if not self.configure_runtime():
                return
            if not self.runtime.ready:
                self.runtime.start(self.server.local_origin)
            port = urlsplit(self.runtime.websocket_origin).port
            self.connector.connect(self.server.server_address[1], port, runtime_ready=self.runtime.ready)
        except (ConnectorError, WorkbenchUnavailable, OSError, ValueError):
            # Connector owns the detailed retry/status state; never start a competing runtime.
            return

    def _run(self):
        while not self._stop.wait(2):
            self.tick()

    def close(self):
        self._stop.set()
        if self.server.desktop_account:
            self.server.desktop_account.close()
        if self._worker:
            self._worker.join(timeout=10)
        if self.connector:
            self.connector.close()
        try:
            self.runtime.close()
        finally:
            self.server.server_close()


def _news_runtime(root, engine_relative, files):
    """Select only browser dependencies covered by the verified product manifest."""
    indexed = {row['path']: row for row in files}
    prefix = engine_relative + '/out/'
    marker = prefix + 'orcad/.runtime-node'
    core = prefix + 'node_modules/playwright-core/'
    if not {marker, core + 'package.json', core + 'index.js'}.issubset(indexed):
        return {}
    node_hash = (root / marker).read_text(encoding='utf-8').strip()
    node = prefix + 'runtimes/node-' + node_hash + '/node.exe'
    if not re.fullmatch('[a-f0-9]{64}', node_hash) or indexed.get(node, {}).get('sha256') != node_hash:
        raise ValueError('news_runtime_node_identity')
    metadata = manifest.strict_json((root / (core + 'package.json')).read_text(encoding='utf-8'))
    if metadata.get('name') != 'playwright-core' or metadata.get('version') != '1.64.0':
        raise ValueError('news_runtime_browser_identity')
    return {'node': str(root / node), 'playwright_core': str(root / core)}


def build_desktop(product_root, data_dir=None, port=8766):
    root = manifest.no_links(product_root).resolve()
    document = manifest.verify_payload(root)
    names = {entry['path'] for entry in document['files']}
    if 'desktop-runtime.json' not in names:
        raise ValueError('desktop_payload_missing')
    config = manifest.strict_json((root / 'desktop-runtime.json').read_text(encoding='utf-8'))
    manifest.exact(config, {'engine_root', 'build_run', 'git', 'ssh', 'keygen', 'issuer', 'hub_origin'}, 'desktop_runtime_fields')
    def path(name):
        relative = str(manifest.relative_path(config[name]))
        candidate = manifest.no_links(root / relative)
        if relative not in names and not any(item.startswith(relative + '/') for item in names):
            raise ValueError('desktop_runtime_unlisted')
        return candidate
    server = build_profile_server(data_dir, port, news_runtime=_news_runtime(root, config['engine_root'], document['files']))
    try:
        runtime = WorkbenchRuntime(RuntimeConfig(path('engine_root'), path('build_run'),
                                                 server.profile.data_dir / 'workbench', path('git'), (),
                                                 inherit_host_environment=True))
        server.workbench_assets = WorkbenchAssets(path('engine_root') / 'out/web', path('build_run') / 'web-assets.json')
        connector = None
        if config['issuer'] or config['hub_origin']:
            connector = RemoteConnector(ConnectorConfig(config['issuer'], config['hub_origin'], path('ssh'), path('keygen')),
                                        ConnectorStore(server.profile.data_dir / 'remote'), on_revoked=runtime.revoke_remote_devices)
        account = RemoteAccount(connector.peer, connector.store) if connector else None
        return Desktop(server, runtime, connector, account)
    except Exception:
        server.server_close()
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--product-root', type=Path, required=True)
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args(argv)
    desktop = build_desktop(args.product_root, args.data_dir, args.port)
    try:
        desktop.start()
        print(f'本机电脑绑定：{desktop.server.local_origin}/desktop', flush=True)
        webbrowser.open(desktop.server.local_origin + '/desktop')
        desktop.server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        desktop.close()


if __name__ == '__main__':
    main()
