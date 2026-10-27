#!/usr/bin/env bash
# 卸载 Control Everything 远程账号部署。默认保留数据（用户库、hub 数据库、证书、配置），
# 加 --purge 才删除。不触碰 n8n、渲染/发布栈、22 端口 sshd、docker 守护进程和 daemon.json。
# 用法：sudo bash uninstall.sh [--purge] [-y]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
. "$SCRIPT_DIR/scripts/common.sh"
PURGE=0 ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    *) die "未知参数: $arg" ;;
  esac
done
require_root
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "将停止并移除 ce-remote 的容器和 systemd 单元$([ "$PURGE" -eq 1 ] && echo '，并且删除所有数据与配置')。继续? [y/N] " answer
  [ "$answer" = "y" ] || die "已取消"
fi

log "停止并移除 systemd 单元"
for unit in ce-remote-hub.service ce-device-provisioner.service ce-device-provisioner.socket \
            ce-device-sshd.service ce-public-ip-alias.service; do
  systemctl disable --now "$unit" 2>/dev/null || true
  rm -f "/etc/systemd/system/$unit"
done
systemctl daemon-reload

if command -v docker >/dev/null 2>&1 && [ -r "$CE_ENV_FILE" ] && [ -d "$CE_PREFIX/deploy" ]; then
  log "移除 ce-remote 容器（只针对 compose 项目 $CE_COMPOSE_PROJECT）"
  if [ "$PURGE" -eq 1 ]; then compose down --volumes --remove-orphans; else compose down --remove-orphans; fi
  docker image rm "ce-remote/keycloak-optimized:$(envget KC_IMAGE_TAG)" 2>/dev/null || true
fi

if [ "$PURGE" -eq 1 ]; then
  log "删除数据与配置"
  rm -rf "$CE_PREFIX" "$CE_ETC" /etc/ce-remote-hub /var/lib/ce-remote-hub /srv/control-everything/remote-ui \
    /etc/ce-device-ssh /etc/ce-device-sshd.conf /var/lib/ce-device-ssh
  # 设备账号 ced_* 由 provisioner 创建；只删除这一前缀的账号。
  while IFS=: read -r name _; do
    case "$name" in ced_*) userdel "$name" 2>/dev/null || true ;; esac
  done </etc/passwd
  userdel ce-remote-hub 2>/dev/null || true
  groupdel ce-remote-hub 2>/dev/null || true
else
  log "已保留 $CE_ETC、/etc/ce-remote-hub、/var/lib/*、docker 数据卷。完全清理请加 --purge"
fi
log "完成。n8n 与其它服务未被触碰。"
