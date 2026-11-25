"""Exercise the installed workbench through its local management CLI and real PTY."""

import json
import secrets
import subprocess
import time


def smoke_terminal(desktop):
    runtime = desktop.runtime
    root = runtime.config.data_root / 'installation-smoke'
    root.mkdir()
    repo = root / 'repository'
    repo.mkdir()
    git = str(runtime.config.git_executable)
    for args in (['init', '-b', 'main'], ['-c', 'user.name=Installation Smoke',
                '-c', 'user.email=smoke@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']):
        result = subprocess.run([git, *args], cwd=repo, env=runtime._env,
                                capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('smoke_git_failed')
    cli = runtime.config.engine_root / 'out/orcad/out/cli/index.js'
    environment = {key: value for key, value in runtime._env.items() if key.upper() not in {
        'ZKYQ_ENVIRONMENT', 'ZKYQ_PAIRING_CODE', 'ZKYQ_REMOTE_PAIRING',
        'ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING'}}
    environment['ZKYQ_USER_DATA_PATH'] = str(runtime.config.data_root / 'state')

    def call(*args):
        try:
            result = subprocess.run([str(runtime._node), str(cli), *args, '--json'],
                                    env=environment, cwd=root, capture_output=True, text=True, timeout=40)
        except subprocess.TimeoutExpired:
            raise RuntimeError('smoke_cli_timeout:' + ':'.join(args[:2])) from None
        if result.returncode:
            raise RuntimeError('smoke_cli_failed:' + ':'.join(args[:2]))
        value = json.loads(result.stdout)
        if value.get('ok') is False:
            raise RuntimeError('smoke_cli_rejected:' + ':'.join(args[:2]))
        return value.get('result', value)

    worktree = None
    try:
        registered = call('repo', 'add', '--path', str(repo))['repo']
        worktree = call('worktree', 'create', '--repo', 'id:' + registered['id'],
                        '--name', 'installation-smoke', '--setup', 'skip')['worktree']['id']
        terminal = call('terminal', 'create', '--worktree', worktree)['terminal']['handle']
        left, right = 'CE_INSTALL_' + secrets.token_hex(8), secrets.token_hex(8)
        nonce = left + right
        # Split the expected output so PTY input echo alone cannot satisfy the assertion.
        command = 'node -e "console.log(\'' + left + '\'+\'' + right + '\')"'
        call('terminal', 'send', '--terminal', terminal, '--text', command, '--enter')
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            tail = call('terminal', 'read', '--terminal', terminal).get('terminal', {}).get('tail', [])
            if nonce in '\n'.join(map(str, tail)):
                return {'terminalEcho': True, 'localManagementCli': True}
            time.sleep(0.2)
        raise RuntimeError('smoke_terminal_output_timeout')
    finally:
        if worktree is not None:
            call('worktree', 'rm', '--worktree', worktree, '--force')
