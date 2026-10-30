---
name: orca-cli
description: >-
  Operate Control Everything-managed worktrees, folder contexts, terminals, repos, automations, artifacts,
  skill sharing, worktree comments, and Control Everything's embedded browser through the `zkyq` CLI. Use
  when the user says "$orca-cli", "Control Everything worktree", "child worktree", "spawn codex/claude in a
  worktree", "read/wait/send Control Everything terminal", "handoff" / "handover" / "give this to another
  agent", "Control Everything browser", "zkyq artifacts", or "share skills". Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when Control Everything state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

# Control Everything CLI

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
CLI skills get orca-cli
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Control Everything is not running, start it with `CLI open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `CLI open` or restart Control Everything. If
`skills get` is unknown, explain that updating Control Everything restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
