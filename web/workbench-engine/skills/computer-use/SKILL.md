---
name: computer-use
description: >-
  Drives the GUI of a visible local app window through `zkyq computer`: accessibility
  tree, clicks, typing, menus, dialogs, and screenshots in native apps and external
  browser windows (Chrome, Edge, Safari) or webviews. Prefer a programmatic path
  (shell, filesystem, git, HTTP, existing CLIs) whenever it can complete the task.
  Use only when a visible window needs GUI control those cannot reach. Do not use
  for Control Everything's embedded browser (`orca-cli`).
---

# Computer Use

This discovery stub loads the version-matched guide from the Control Everything executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ZKYQ_CLI_COMMAND` environment variable is set, use its value. The workbench exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `zkyq-dev`.
- Otherwise, use `zkyq`.

Below, `CLI` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `CLI` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Control Everything build.

## Load the version-matched guide before running Control Everything commands

```text
CLI skills get computer-use
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Control Everything is not running, start it with `CLI open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `CLI open` or restart Control Everything. If
`skills get` is unknown, explain that updating Control Everything restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
