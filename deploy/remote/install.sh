#!/usr/bin/env bash
# Control Everything 远程账号一键部署（Ubuntu，单台轻量服务器，无域名）。
# 未在真实服务器上验证；先用 --preflight-only 看报告，再正式安装。可重复运行（幂等）。
#
# 用法：sudo bash deploy/remote/install.sh [选项]
#   --public-ip IP        公网 IPv4（默认自动探测，会要求你核对）
#   --mobile-scheme S     手机 App 回调 scheme（默认保留 env 模板里的值）
#   --preflight-only      只做预检和报告，不改动系统
#   --no-lo-alias         不在 lo 上添加公网 IP 的 /32 别名（默认添加，用于 NAT 回环）
#   --force               内存/端口预检失败时仍继续（不建议）
#   -y, --yes             不再询问确认
#
# 影响范围（全部列在这里，除此之外不改宿主机）：
#   新增：/opt/ce-remote  /etc/ce-remote  /etc/ce-remote-hub  /etc/ce-device-ssh  /etc/ce-device-sshd.conf
#         /var/lib/ce-remote-hub  /var/lib/ce-device-ssh  /srv/control-everything/remote-ui
#         系统用户/组 ce-remote-hub；5 个 systemd 单元（ce-public-ip-alias / ce-device-sshd /
#         ce-device-provisioner.socket+service / ce-remote-hub）；docker compose 项目 ce-remote；lo 别名。
#   端口：公网 80、443（Caddy）、2223（专用 sshd）；127.0.0.1 上 18868/18869/18080 和设备隧道 20000-20999。
#   绝不修改：既有 n8n、渲染/发布栈、22 端口 sshd、/etc/docker/daemon.json、不重启 dockerd。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=scripts/common.sh
. "$SCRIPT_DIR/scripts/common.sh"

PUBLIC_IP="" MOBILE_SCHEME="" PREFLIGHT_ONLY=0 LO_ALIAS=1 FORCE=0 ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --public-ip) PUBLIC_IP="${2:?}"; shift 2 ;;
    --mobile-scheme) MOBILE_SCHEME="${2:?}"; shift 2 ;;
    --preflight-only) PREFLIGHT_ONLY=1; shift ;;
    --no-lo-alias) LO_ALIAS=0; shift ;;
    --force) FORCE=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "未知参数: $1" ;;
  esac
done

require_root

# ------------------------------------------------------------------ 预检
PREFLIGHT_FAIL=0
fail() { warn "$*"; PREFLIGHT_FAIL=1; }

preflight() {
  log "=== 预检报告（只读） ==="
  . /etc/os-release 2>/dev/null || true
  log "系统: ${PRETTY_NAME:-unknown}  内核: $(uname -r)  CPU 核数: $(nproc)"
  case "${ID:-}" in ubuntu|debian) ;; *) fail "只在 Ubuntu/Debian 上设计过（当前: ${ID:-unknown}）" ;; esac
  command -v systemctl >/dev/null || fail "需要 systemd"
  command -v openssl >/dev/null || fail "需要 openssl"
  command -v ssh-keygen >/dev/null || fail "需要 ssh-keygen（apt install openssh-client）"
  [ -x /usr/sbin/sshd ] || fail "需要 /usr/sbin/sshd（apt install openssh-server）"

  local pyver
  PYTHON_BIN=""
  for candidate in python3.13 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
      PYTHON_BIN="$(command -v "$candidate")"; break
    fi
  done
  if [ -n "$PYTHON_BIN" ]; then
    pyver="$("$PYTHON_BIN" -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
    log "Python: $PYTHON_BIN ($pyver)"
  else
    fail "hub 需要 Python >= 3.12（Ubuntu 24.04 自带；22.04 请先 apt install python3.12 或用 uv 安装）"
  fi

  log "--- 内存 ---"
  free -m
  local avail_mb
  avail_mb="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
  log "当前可用内存约 ${avail_mb} MiB；本套件上限合计约 1150 MiB（Keycloak 768 + Postgres 160 + Caddy 128 + oauth2-proxy 96，hub ≤192 在 systemd 里限制）"
  if [ "$avail_mb" -lt 1400 ]; then
    fail "可用内存不足 1400 MiB，继续会挤压 n8n 等现有服务（可调小 KC_MEM_LIMIT，但低于 640m 不推荐）"
  fi
  if [ -r /sys/fs/cgroup/memory.max ]; then log "cgroup 内存上限: $(cat /sys/fs/cgroup/memory.max)"; fi
  swapon --show 2>/dev/null || true

  log "--- 磁盘 ---"
  df -h / | tail -n1
  local free_gb
  free_gb="$(df -BG --output=avail / | tail -n1 | tr -dc '0-9')"
  [ "${free_gb:-0}" -ge 6 ] || fail "根分区可用空间不足 6 GiB（镜像约 1.5 GiB + 构建缓存）"

  log "--- 端口（谁在监听） ---"
  local port owner expected
  for port in 80 443 2223 18868 18869 18080; do
    case "$port" in
      80|443) expected='caddy' ;;
      2223) expected='sshd' ;;
      18868) expected='oauth2-proxy' ;;
      18869) expected='python' ;;
      *) expected='docker-proxy' ;;
    esac
    owner="$(port_owner "$port")"
    if [ -z "$owner" ]; then
      log "端口 $port: 空闲"
    elif printf '%s' "$owner" | grep -q "$expected"; then
      log "端口 $port: 已由本套件的 $expected 占用（重复安装）: $owner"
    else
      fail "端口 $port 已被其它进程占用: $owner"
    fi
  done
  owner="$(port_owner 5678)"
  log "n8n (127.0.0.1:5678): ${owner:-未监听}（本套件不会使用或改动该端口）"

  log "--- Docker ---"
  if command -v docker >/dev/null 2>&1; then
    docker --version
    docker compose version >/dev/null 2>&1 || fail "缺少 docker compose 插件（apt install docker-compose-v2）"
    docker info >/dev/null 2>&1 || fail "docker 守护进程不可用"
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' || true
    memory_report
  else
    log "未安装 Docker；正式安装时会用 apt 安装 docker.io 和 docker-compose-v2（不改 daemon.json、不改镜像加速）"
  fi
  log "仓库根目录: $REPO_ROOT"
  for f in src/control_everything tools/scripts/remote_hub_admin.py tools/scripts/remote_ssh_provisioner.py \
           web/workspace/remote-account.html web/workspace/identity-theme/control-everything; do
    [ -e "$REPO_ROOT/$f" ] || fail "仓库缺少 $f（请在完整克隆里运行）"
  done
}

preflight
if [ "$PREFLIGHT_FAIL" -ne 0 ] && [ "$FORCE" -ne 1 ]; then
  die "预检未通过（上面的警告）。修正后重试，或明确使用 --force。"
fi
[ "$PREFLIGHT_ONLY" -eq 0 ] || { log "预检结束（--preflight-only），未做任何改动。"; exit 0; }

# ------------------------------------------------------------------ 公网 IP
detect_ip() {
  local ip=""
  for url in https://api.ipify.org https://ifconfig.me https://ip.sb; do
    ip="$(curl -4 -fsS --max-time 6 "$url" 2>/dev/null || true)"
    if printf '%s' "$ip" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then printf '%s' "$ip"; return 0; fi
  done
  return 1
}
if [ -z "$PUBLIC_IP" ] && [ -r "$CE_ENV_FILE" ]; then
  existing="$(envget CE_PUBLIC_IP)"
  [ "$existing" = "203.0.113.10" ] || PUBLIC_IP="$existing"
fi
[ -n "$PUBLIC_IP" ] || PUBLIC_IP="$(detect_ip)" || die "无法自动探测公网 IP，请用 --public-ip 指定"
printf '%s' "$PUBLIC_IP" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || die "公网 IP 格式不对: $PUBLIC_IP"
case "$PUBLIC_IP" in
  10.*|192.168.*|127.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|169.254.*|203.0.113.*)
    die "$PUBLIC_IP 不是公网地址。Let's Encrypt 不会给私网/文档地址签证书" ;;
esac
log "使用公网 IP: $PUBLIC_IP"
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "这是控制台里显示的这台服务器公网 IP 吗？继续安装? [y/N] " answer
  [ "$answer" = "y" ] || die "已取消"
fi

# ------------------------------------------------------------------ Docker
if ! command -v docker >/dev/null 2>&1; then
  log "安装 Docker（apt: docker.io docker-compose-v2）"
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
fi
docker compose version >/dev/null 2>&1 || {
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2 \
    || die "无法安装 docker compose 插件，请手动安装后重试"
}

# ------------------------------------------------------------------ 文件与用户
log "创建系统用户和目录"
getent group ce-remote-hub >/dev/null || groupadd --system ce-remote-hub
id ce-remote-hub >/dev/null 2>&1 || useradd --system --gid ce-remote-hub --no-create-home \
  --home-dir /nonexistent --shell /usr/sbin/nologin ce-remote-hub
install -d -m 0755 "$CE_PREFIX" "$CE_PREFIX/src" "$CE_PREFIX/tools/scripts" "$CE_PREFIX/deploy"
install -d -m 0755 /srv/control-everything/remote-ui
install -d -m 0750 -o root -g root "$CE_ETC"
install -d -m 0750 -o root -g ce-remote-hub /etc/ce-remote-hub
install -d -m 0755 /etc/ce-device-ssh
printf '%s\n' "$PYTHON_BIN" >"$CE_PREFIX/python-path"

log "复制代码（hub 仅用标准库）"
rm -rf "$CE_PREFIX/src/control_everything"
cp -a "$REPO_ROOT/src/control_everything" "$CE_PREFIX/src/control_everything"
find "$CE_PREFIX/src" -name '__pycache__' -type d -prune -exec rm -rf {} +
install -m 0644 "$REPO_ROOT/tools/scripts/remote_hub_admin.py" "$REPO_ROOT/tools/scripts/remote_ssh_provisioner.py" \
  "$CE_PREFIX/tools/scripts/"
for f in remote-account.html remote-account.js remote-account.css account-device.js ui-theme.js; do
  install -m 0644 "$REPO_ROOT/web/workspace/$f" /srv/control-everything/remote-ui/
done

log "同步部署文件到 $CE_PREFIX/deploy"
rm -rf "$CE_PREFIX/deploy/keycloak/themes"
cp -a "$SCRIPT_DIR/." "$CE_PREFIX/deploy/"
rm -f "$CE_PREFIX/deploy/ce-remote.env"   # 真实 env 只放在 /etc
mkdir -p "$CE_PREFIX/deploy/keycloak/themes"
cp -a "$REPO_ROOT/web/workspace/identity-theme/control-everything" "$CE_PREFIX/deploy/keycloak/themes/control-everything"

# ------------------------------------------------------------------ env（只在首次生成秘密）
if [ ! -e "$CE_ENV_FILE" ]; then
  log "生成 $CE_ENV_FILE（权限 0600，随机秘密只存在这里）"
  install -m 0600 "$SCRIPT_DIR/ce-remote.env.example" "$CE_ENV_FILE"
  for key in CE_ROUTE_PROOF CE_HUB_INTROSPECTION_CLIENT_SECRET CE_DIRECTORY_CLIENT_SECRET \
             OAUTH2_PROXY_CLIENT_SECRET KC_DB_PASSWORD; do
    envset "$key" "$(openssl rand -hex 24)"
  done
  envset OAUTH2_PROXY_COOKIE_SECRET "$(openssl rand -hex 16)"
  envset KC_BOOTSTRAP_ADMIN_PASSWORD "$(openssl rand -hex 16)"
else
  log "沿用已有的 $CE_ENV_FILE（不重新生成秘密）"
  chmod 0600 "$CE_ENV_FILE"
fi
envset CE_PUBLIC_IP "$PUBLIC_IP"
envset CE_PUBLIC_ORIGIN "https://$PUBLIC_IP"
envset CE_OIDC_ISSUER "https://$PUBLIC_IP/realms/workbench"
envset CE_OIDC_LOGOUT_URL \
  "https://$PUBLIC_IP/realms/workbench/protocol/openid-connect/logout?client_id=$(envget CE_OIDC_WEB_CLIENT_ID)&id_token_hint={id_token}"
[ -z "$MOBILE_SCHEME" ] || envset CE_MOBILE_SCHEME "$MOBILE_SCHEME"
if grep -q CHANGE_ME_AT_INSTALL "$CE_ENV_FILE"; then die "$CE_ENV_FILE 里还有 CHANGE_ME_AT_INSTALL 占位值"; fi

# ------------------------------------------------------------------ 专用 sshd + hub 配置
if [ ! -e /etc/ce-device-ssh/ssh_host_ed25519_key ]; then
  log "为专用 sshd (2223) 生成独立 host key"
  ssh-keygen -q -t ed25519 -N '' -C 'ce-device-sshd' -f /etc/ce-device-ssh/ssh_host_ed25519_key
fi
chmod 0600 /etc/ce-device-ssh/ssh_host_ed25519_key
if [ -e /etc/ce-device-sshd.conf ] && ! cmp -s "$SCRIPT_DIR/systemd/ce-device-sshd.conf" /etc/ce-device-sshd.conf; then
  cp -a /etc/ce-device-sshd.conf "/etc/ce-device-sshd.conf.bak.$(date +%s)"
fi
install -m 0644 "$SCRIPT_DIR/systemd/ce-device-sshd.conf" /etc/ce-device-sshd.conf
/usr/sbin/sshd -t -f /etc/ce-device-sshd.conf

log "生成 hub 私有配置 $CE_HUB_CONFIG"
ENV_FILE="$CE_ENV_FILE" CONFIG="$CE_HUB_CONFIG" python3 - <<'PY'
import json, os, subprocess

def envget(key):
    with open(os.environ["ENV_FILE"], encoding="utf-8") as handle:
        for line in handle:
            if line.startswith(key + "="):
                return line.rstrip("\n").split("=", 1)[1]
    raise SystemExit("missing " + key)

path = os.environ["CONFIG"]
previous = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as handle:
        previous = json.load(handle)
with open("/etc/ce-device-ssh/ssh_host_ed25519_key.pub", encoding="utf-8") as handle:
    host_key = " ".join(handle.read().split()[:2])
config = {
    "issuer": envget("CE_OIDC_ISSUER"),
    "introspection_client_id": envget("CE_OIDC_HUB_CLIENT_ID"),
    "introspection_client_secret": envget("CE_HUB_INTROSPECTION_CLIENT_SECRET"),
    "database": "/var/lib/ce-remote-hub/control.sqlite3",
    "public_origin": envget("CE_PUBLIC_ORIGIN"),
    "route_proof": envget("CE_ROUTE_PROOF"),
    "ssh_host": envget("CE_PUBLIC_IP"),
    "ssh_host_key": host_key,
    "ssh_keygen": "/usr/bin/ssh-keygen",
    "provisioner_socket": "/run/ce-device-provisioner.sock",
    # 管理员必须是核对过的精确 sub：首次安装为空，用 scripts/promote-admin.sh 添加。
    "admin_subjects": previous.get("admin_subjects", []),
    "static_paths": previous.get("static_paths", []),
    "user_directory": {
        "client_id": envget("CE_OIDC_DIRECTORY_CLIENT_ID"),
        "client_secret": envget("CE_DIRECTORY_CLIENT_SECRET"),
    },
}
tmp = path + ".tmp"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
os.replace(tmp, path)
PY
chown ce-remote-hub:ce-remote-hub "$CE_HUB_CONFIG"
chmod 0600 "$CE_HUB_CONFIG"

# ------------------------------------------------------------------ systemd
log "安装 systemd 单元"
for unit in ce-device-sshd.service ce-device-provisioner.socket ce-device-provisioner.service \
            ce-remote-hub.service ce-public-ip-alias.service; do
  [ "$unit" != ce-public-ip-alias.service ] || [ "$LO_ALIAS" -eq 1 ] || continue
  sed -e "s|@PYTHON@|$PYTHON_BIN|g" -e "s|@CE_PUBLIC_IP@|$PUBLIC_IP|g" \
    "$SCRIPT_DIR/systemd/$unit" >"/etc/systemd/system/$unit"
  chmod 0644 "/etc/systemd/system/$unit"
done
systemctl daemon-reload
if [ "$LO_ALIAS" -eq 1 ]; then systemctl enable --now ce-public-ip-alias.service; fi

# ------------------------------------------------------------------ 容器
log "拉取镜像并构建 Keycloak 预构建镜像（首次需要几分钟，镜像站可在 env 里设置前缀）"
compose pull caddy oauth2-proxy postgres || warn "拉取失败：在国内可在 $CE_ENV_FILE 设置 CE_REGISTRY_DOCKERHUB / CE_REGISTRY_QUAY 镜像前缀后重试"
compose build keycloak
log "启动容器"
compose up -d

log "启动 hub、专用 sshd 与 provisioner"
systemctl enable --now ce-device-provisioner.socket ce-device-sshd.service ce-remote-hub.service

# ------------------------------------------------------------------ 安装后检查
log "等待 Keycloak 就绪（最多 4 分钟）"
for _ in $(seq 1 48); do
  state="$(docker inspect -f '{{.State.Health.Status}}' ce-remote-idp 2>/dev/null || true)"
  [ "$state" = healthy ] && break
  sleep 5
done
log "Keycloak 容器健康状态: ${state:-unknown}"

log "等待 Let's Encrypt IP 证书（最多 3 分钟；需要公网 80/443 可达）"
cert_ok=0
for _ in $(seq 1 36); do
  if curl -fsS --max-time 8 -o /dev/null "https://$PUBLIC_IP/realms/workbench/.well-known/openid-configuration" 2>/dev/null; then
    cert_ok=1; break
  fi
  sleep 5
done
if [ "$cert_ok" -eq 1 ]; then
  log "HTTPS + 受信任证书 + OIDC 发现文档：通过"
else
  warn "尚未通过受信任证书访问发现文档。查看: docker logs ce-remote-caddy --tail 80"
fi

log "=== 安装后报告 ==="
memory_report
systemctl --no-pager --lines=0 status ce-remote-hub ce-device-sshd ce-device-provisioner.socket 2>/dev/null | grep -E '●|Active' || true
cat <<MSG

下一步：
  1) 浏览器打开 https://$PUBLIC_IP/remote ，注册第一个账号。
  2) sudo bash $CE_PREFIX/deploy/scripts/promote-admin.sh <刚注册的用户名>   # 设为 hub 管理员
  3) sudo bash $CE_PREFIX/deploy/scripts/check.sh                              # 自检
Keycloak 管理员密码在 $CE_ENV_FILE (KC_BOOTSTRAP_ADMIN_PASSWORD)，管理控制台不对公网开放。
MSG
