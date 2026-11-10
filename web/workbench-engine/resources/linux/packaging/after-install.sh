#!/bin/bash
# Register the bundled command on PATH at package-install time.
# The in-app "Install CLI" action (CliInstaller) can never run on a headless
# server, so without this symlink `zkyq serve` is unreachable from the shell on
# the exact hosts that need it most. deb/rpm both run this after unpacking.
#
# The shim resolves the real app by walking up from its own location, so a
# symlink works. We discover the install dir instead of hardcoding /opt/Orca
# because electron-builder's directory name can vary by productName sanitization.
set -e

link="/usr/bin/zkyq"

is_owned_link() {
  [ -L "$1" ] || return 1
  local link_target candidate candidate_target
  link_target="$(readlink -f -- "$1" 2>/dev/null || true)"
  for candidate in /opt/{Orca,orca-ide,orca}/resources/bin/{zkyq,orca-ide,orca}; do
    candidate_target="$(readlink -f -- "$candidate" 2>/dev/null || true)"
    if [ -n "$candidate_target" ] && [ "$link_target" = "$candidate_target" ]; then
      return 0
    fi
  done
  return 1
}

for dir in /opt/Orca /opt/orca-ide /opt/orca; do
  sandbox="$dir/chrome-sandbox"
  if [ -f "$sandbox" ]; then
    # Why: packaged Linux installs must leave Chromium's sandbox helper usable
    # on hosts where unprivileged user namespaces are unavailable.
    chmod 4755 "$sandbox" || true
  fi

  shim="$dir/resources/bin/zkyq"
  if [ -x "$shim" ]; then
    # Only manage our own symlink; never clobber another program's command.
    if { [ ! -e "$link" ] && [ ! -L "$link" ]; } || is_owned_link "$link"; then
      ln -sfn -- "$shim" "$link"
      for legacy in /usr/bin/orca-ide /usr/bin/orca; do
        if is_owned_link "$legacy"; then rm -f -- "$legacy"; fi
      done
    fi
    break
  fi
done

exit 0
