# Built-in browser commands

Use a snapshot-interact-re-snapshot loop:

```text
CLI goto --url https://example.com --json
CLI snapshot --json
CLI click --element @e3 --json
CLI snapshot --json
```

Common commands:

```text
CLI goto --url <url> --json
CLI back --json
CLI reload --json
CLI snapshot --json
CLI screenshot --json
CLI full-screenshot --json
CLI pdf --json
CLI click --element <ref> --json
CLI fill --element <ref> --value <text> --json
CLI type --input <text> --json
CLI select --element <ref> --value <value> --json
CLI check --element <ref> --json
CLI scroll --direction down --amount 1000 --json
CLI hover --element <ref> --json
CLI focus --element <ref> --json
CLI keypress --key Enter --json
CLI upload --element <ref> --files <paths> --json
CLI wait --text <text> --json
CLI wait --url <substring> --json
CLI wait --selector <css> --json
CLI wait --load networkidle --json
CLI eval --expression <js> --json
CLI tab list --json
CLI tab create --url <url> --json
CLI tab switch --index <n> --json
CLI tab close --index <n> --json
CLI cookie get --json
CLI capture start --json
CLI console --limit 50 --json
CLI network --limit 50 --json
CLI exec --command "help" --json
```

Browser rules:

- Re-snapshot after navigation, tab switches, clicks that change the page, and any `browser_stale_ref`.
- Refs like `@e1` are assigned by `snapshot`, scoped to one tab, and invalidated by navigation or tab switch.
- Browser commands default to the current worktree and its active tab. Use `--worktree all` only intentionally.
- For concurrent browser work, run `CLI tab list --json`, read `tabs[].browserPageId`, and pass `--page <browserPageId>` on later commands.
- Use typed tab commands (`CLI tab list/create/close/switch`), not `CLI exec --command "tab ..."`, so Control Everything keeps UI state synchronized.
- Prefer `wait --text`, `--url`, `--selector`, or `--load` after async page changes instead of bare timeouts.
- Anything not listed above goes through `CLI exec --command "<agent-browser command>"`.
- If `fill` or `type` fails on a custom input, try `CLI focus --element @e1 --json` then `CLI inserttext --text "text" --json`.
- A client-hosted page renders in the paired desktop's browser engine, so every command against it needs that desktop online and returns `browser_host_unavailable` while it is closed, asleep, or disconnected. Server-hosted pages run with no desktop attached; prefer them for long or unattended automation.

Common recoveries:

- `browser_no_tab`: open a tab with `CLI tab create --url <url> --json`.
- `browser_stale_ref`: run `CLI snapshot --json` and retry with fresh refs.
- `browser_tab_not_found`: run `CLI tab list --json` before switching or closing.
- `browser_host_unavailable`: the desktop hosting the page is offline. Bring it back, or recreate the page with server placement if the work must outlive the desktop session.
