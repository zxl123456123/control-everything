"""Fixed root service entry point; accepts only systemd's inherited Unix socket."""

from control_everything.integrations.remote_hub.provisioner_server import main

if __name__ == "__main__":
    main()
