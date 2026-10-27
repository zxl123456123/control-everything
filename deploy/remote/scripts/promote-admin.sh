#!/usr/bin/env bash
# 把一个已注册的用户设为 hub 管理员：从 IdP 读取精确 sub，写入 hub 私有配置并激活成员资格。
# 用法：sudo bash promote-admin.sh <用户名>
# 管理员只认 sub，不认用户名；本脚本只是帮你查出 sub，请自行核对输出后再确认。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"
require_root
username="${1:?用法: promote-admin.sh <用户名>}"
[ -r "$CE_ENV_FILE" ] || die "找不到 $CE_ENV_FILE，请先运行 install.sh"
idp_addr="$(envget CE_IDP_UPSTREAM)"
admin_user="$(envget KC_BOOTSTRAP_ADMIN_USERNAME)"
realm_url="$(envget CE_OIDC_ISSUER)"
realm="${realm_url##*/}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
chmod 0600 "$tmp"
# 密码只经 0600 临时文件交给 curl，不出现在进程列表里。
printf '%s' "$(envget KC_BOOTSTRAP_ADMIN_PASSWORD)" >"$tmp"
token_json="$(curl -fsS -H 'X-Forwarded-Proto: https' \
  --data 'grant_type=password' --data 'client_id=admin-cli' \
  --data-urlencode "username=$admin_user" --data-urlencode "password@$tmp" \
  "http://$idp_addr/realms/master/protocol/openid-connect/token")"
token="$(printf '%s' "$token_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
users_json="$(curl -fsS -H 'X-Forwarded-Proto: https' -H "Authorization: Bearer $token" \
  --get --data-urlencode "username=$username" --data 'exact=true' \
  "http://$idp_addr/admin/realms/$realm/users")"
sub="$(printf '%s' "$users_json" | python3 -c '
import json, sys
users = json.load(sys.stdin)
if len(users) != 1:
    sys.exit("没有找到唯一的用户")
print(users[0]["id"])')"
log "用户 $username 的 sub = $sub"
read -r -p "确认把该 sub 设为管理员? [y/N] " answer
[ "$answer" = "y" ] || die "已取消"

SUB="$sub" CONFIG="$CE_HUB_CONFIG" python3 - <<'PY'
import json, os
path = os.environ["CONFIG"]
with open(path, encoding="utf-8") as handle:
    config = json.load(handle)
if os.environ["SUB"] not in config["admin_subjects"]:
    config["admin_subjects"].append(os.environ["SUB"])
tmp = path + ".tmp"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
os.replace(tmp, path)
PY
chown ce-remote-hub:ce-remote-hub "$CE_HUB_CONFIG"
chmod 0600 "$CE_HUB_CONFIG"
PYBIN="$(cat "$CE_PREFIX/python-path")"
runuser -u ce-remote-hub -- env PYTHONPATH="$CE_PREFIX/src" "$PYBIN" \
  "$CE_PREFIX/tools/scripts/remote_hub_admin.py" --config "$CE_HUB_CONFIG" bootstrap-admin
systemctl restart ce-remote-hub.service
log "完成。该账号现在可以在 /remote 页面看到管理员视图。"
