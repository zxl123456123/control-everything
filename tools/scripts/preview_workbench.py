"""Run the workbench with an independent profile and the host's tools and Agent configuration."""

import argparse
from pathlib import Path
import sys

from control_everything.http.gateway import build_profile_server
from control_everything.http.workbench import WorkbenchAssets
from control_everything.integrations.workbench_runtime import RuntimeConfig, WorkbenchRuntime, WorkbenchUnavailable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/packaging"))
from build_assets import export_workbench_assets


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--build-run", type=Path, required=True)
    parser.add_argument("--git", type=Path, required=True)
    parser.add_argument("--workspace-root", type=Path, action="append", required=True)
    parser.add_argument("--isolated-environment", action="store_true",
                        help="Use an isolated tool environment instead of the host's tools and Agent configuration.")
    parser.add_argument("--port", type=int, default=8769)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535 or not args.data_dir.is_absolute():
        parser.error("Use an absolute isolated profile directory and a port from 1024 to 65535.")
    engine = ROOT / "web/workbench-engine"
    server = runtime = None
    result = 0
    try:
        manifest = export_workbench_assets(engine, args.build_run)
        assets = WorkbenchAssets(engine / "out/web", manifest)
        # Bind the HTTP port first; no request is served before the runtime is ready.
        server = build_profile_server(args.data_dir, args.port)
        runtime = WorkbenchRuntime(RuntimeConfig(engine, args.build_run, args.data_dir / "workbench",
                                                 args.git, tuple(args.workspace_root),
                                                 inherit_host_environment=not args.isolated_environment))
        runtime.start(server.origin)
        server.attach_workbench_runtime(runtime)
        server.workbench_assets = assets
        print(f"平台工作台：{server.origin}/studio（独立测试数据）", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError, WorkbenchUnavailable) as error:
        print("工作台启动或运行失败：" + (error.code if isinstance(error, WorkbenchUnavailable)
                                          else type(error).__name__), file=sys.stderr)
        result = 1
    finally:
        if runtime is not None:
            try:
                runtime.close()
            except WorkbenchUnavailable as error:
                print(f"正常关闭未核验（{error.code}）；正在回收本次独占测试进程。", file=sys.stderr)
                runtime.close(force=True)
                result = 1
        if server is not None:
            server.server_close()
    return result


if __name__ == "__main__":
    raise SystemExit(main())
