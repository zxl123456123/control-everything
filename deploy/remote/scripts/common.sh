#!/usr/bin/env bash
# install.sh / uninstall.sh / promote-admin.sh / check.sh 共用的小函数。只被 source，不单独运行。
# shellcheck shell=bash

CE_PREFIX="${CE_PREFIX:-/opt/ce-remote}"
CE_ETC="${CE_ETC:-/etc/ce-remote}"
CE_ENV_FILE="${CE_ENV_FILE:-$CE_ETC/ce-remote.env}"
CE_HUB_CONFIG="${CE_HUB_CONFIG:-/etc/ce-remote-hub/config.json}"
CE_COMPOSE_PROJECT=ce-remote

log() { printf '\033[1;34m[ce-remote]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ce-remote] 警告:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[ce-remote] 错误:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || die "请用 root 运行（例如 sudo bash $0）"; }

# 读取 env 文件里的一个键（不 source 整个文件：值里可能有空格、& 和 {}）。
envget() {
  local key="$1" file="${2:-$CE_ENV_FILE}"
  grep -m1 "^${key}=" "$file" | cut -d= -f2-
}

# 写回 env 文件里的一个键（值里可含 / & 等字符）；键不存在则追加。
envset() {
  local key="$1" value="$2" file="${3:-$CE_ENV_FILE}" tmp
  tmp="$(mktemp)"
  KEY="$key" VALUE="$value" awk 'BEGIN{k=ENVIRON["KEY"]; v=ENVIRON["VALUE"]; done=0}
    index($0, k "=")==1 && !done {print k "=" v; done=1; next} {print}
    END{if(!done) print k "=" v}' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

compose() {
  docker compose -p "$CE_COMPOSE_PROJECT" --env-file "$CE_ENV_FILE" \
    -f "$CE_PREFIX/deploy/docker-compose.yml" -f "$CE_PREFIX/deploy/idp-keycloak.yml" "$@"
}

# 内存/端口/容器概览：安装前和安装后各打印一次。
memory_report() {
  log "内存概览 (free -m)"
  free -m
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    log "容器内存占用 (docker stats --no-stream)"
    docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' || true
  fi
}

port_owner() {
  # 打印占用 TCP 监听端口的进程；空表示空闲。
  ss -H -ltnp "sport = :$1" 2>/dev/null | awk '{print $4, $6}' | head -n3
}
