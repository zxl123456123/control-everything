#!/usr/bin/env bash
# 部署后自检（只读）。每一项输出 PASS/FAIL；不能代替真实双账号、双设备、手机的验收。
# 用法：sudo bash check.sh
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"
require_root
FAILS=0
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then printf 'PASS  %s\n' "$name"; else printf 'FAIL  %s\n' "$name"; FAILS=$((FAILS + 1)); fi
}
ip="$(envget CE_PUBLIC_IP)"
issuer="$(envget CE_OIDC_ISSUER)"
check "systemd: hub"          systemctl is-active --quiet ce-remote-hub
check "systemd: device sshd"  systemctl is-active --quiet ce-device-sshd
check "systemd: provisioner socket" systemctl is-active --quiet ce-device-provisioner.socket
check "容器: caddy"           test "$(docker inspect -f '{{.State.Running}}' ce-remote-caddy)" = true
check "容器: oauth2-proxy"    test "$(docker inspect -f '{{.State.Running}}' ce-remote-oauth2-proxy)" = true
check "容器: idp healthy"     test "$(docker inspect -f '{{.State.Health.Status}}' ce-remote-idp)" = healthy
check "公网 IP 证书受信任 (无 -k) 且发现文档可读" curl -fsS --max-time 10 "$issuer/.well-known/openid-configuration"
check "发现文档里的 issuer 与配置一致" bash -c "curl -fsS --max-time 10 '$issuer/.well-known/openid-configuration' | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)[\"issuer\"]==\"$issuer\" else 1)'"
check "/remote 账号页 200"    bash -c "curl -fsS --max-time 10 -o /dev/null https://$ip/remote"
check "管理控制台对公网不可直达 (认证前 401/302/404)" bash -c "code=\$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' https://$ip/admin/master/console/); [ \"\$code\" != 200 ]"
check "master realm 对公网不可直达" bash -c "code=\$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' https://$ip/realms/master/.well-known/openid-configuration); [ \"\$code\" != 200 ]"
check "/__ce_remote_health 对公网 404" bash -c "[ \"\$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' https://$ip/__ce_remote_health)\" = 404 ]"
check "无登录访问业务页被拒绝 (非 200)" bash -c "[ \"\$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' https://$ip/workspace)\" != 200 ]"
check "专用 sshd 在 2223 监听" bash -c "ss -H -ltn 'sport = :2223' | grep -q ."
check "hub 只监听 127.0.0.1:18869" bash -c "ss -H -ltn 'sport = :18869' | awk '{print \$4}' | grep -qx '127.0.0.1:18869'"
check "hub 配置权限 0600" bash -c "[ \"\$(stat -c %a '$CE_HUB_CONFIG')\" = 600 ]"
check "env 权限 0600" bash -c "[ \"\$(stat -c %a '$CE_ENV_FILE')\" = 600 ]"
check "n8n 5678 仍在监听 (若原本在运行)" bash -c "ss -H -ltn 'sport = :5678' | grep -q . || ! docker ps --format '{{.Names}}' | grep -qi n8n"
echo
memory_report
if [ "$FAILS" -eq 0 ]; then log "全部通过（仅代表服务就绪）"; else die "$FAILS 项失败"; fi
