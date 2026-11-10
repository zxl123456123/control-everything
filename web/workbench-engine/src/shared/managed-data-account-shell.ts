export const MANAGED_DATA_ACCOUNT_POSIX_RESTORE = `if [[ -n "\${ZKYQ_DATA_ACCOUNT_DATA_HOME:-}" ]]; then
  export XDG_DATA_HOME="\${ZKYQ_DATA_ACCOUNT_DATA_HOME}"
  export XDG_STATE_HOME="\${ZKYQ_DATA_ACCOUNT_STATE_HOME}"
  if [[ "\${ZKYQ_DATA_ACCOUNT_PROVIDER:-}" == opencode ]]; then
    export OPENCODE_AUTH_CONTENT=""
    export OPENCODE_DB="opencode.db"
  fi
fi`

export const MANAGED_DATA_ACCOUNT_POWERSHELL_RESTORE = `if ($env:ZKYQ_DATA_ACCOUNT_DATA_HOME) {
  $env:XDG_DATA_HOME = $env:ZKYQ_DATA_ACCOUNT_DATA_HOME
  $env:XDG_STATE_HOME = $env:ZKYQ_DATA_ACCOUNT_STATE_HOME
  if ($env:ZKYQ_DATA_ACCOUNT_PROVIDER -eq 'opencode') {
    $env:OPENCODE_AUTH_CONTENT = ''
    $env:OPENCODE_DB = 'opencode.db'
  }
}`

export const MANAGED_DATA_ACCOUNT_FISH_RESTORE = `        if set -q ZKYQ_DATA_ACCOUNT_DATA_HOME; and test -n "$ZKYQ_DATA_ACCOUNT_DATA_HOME"
            set -gx XDG_DATA_HOME "$ZKYQ_DATA_ACCOUNT_DATA_HOME"
            set -gx XDG_STATE_HOME "$ZKYQ_DATA_ACCOUNT_STATE_HOME"
            if test "$ZKYQ_DATA_ACCOUNT_PROVIDER" = opencode
                set -gx OPENCODE_AUTH_CONTENT ''
                set -gx OPENCODE_DB opencode.db
            end
        end`
