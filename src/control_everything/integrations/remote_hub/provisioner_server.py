"""Systemd socket-activated provisioner; no hub-controlled commands or filesystem paths."""

import argparse
import os
import pwd
import socket

from .linux_provisioner import LinuxDeviceProvisioner
from .identity import HubError
from .provisioner import serve_connection


def main(argv=None):
    parser = argparse.ArgumentParser(description="Root-owned device SSH provisioner")
    parser.add_argument("--hub-user", default="ce-remote-hub")
    args = parser.parse_args(argv)
    if os.geteuid() != 0 or os.environ.get("LISTEN_PID") != str(os.getpid()) or os.environ.get("LISTEN_FDS") != "1":
        raise RuntimeError("requires_root_systemd_socket_activation")
    backend, allowed_uid = LinuxDeviceProvisioner(), pwd.getpwnam(args.hub_user).pw_uid
    with socket.socket(fileno=3) as listener:
        if listener.family != socket.AF_UNIX or listener.type != socket.SOCK_STREAM:
            raise RuntimeError("requires_unix_stream_socket")
        while True:
            connection, _ = listener.accept()
            with connection:
                try:
                    serve_connection(connection, backend, allowed_uid)
                except (OSError, ValueError, HubError):
                    pass
