"""Repository entry point; installed deployments call the same package implementation."""

from control_everything.http.remote_hub import main

if __name__ == "__main__":
    main()
