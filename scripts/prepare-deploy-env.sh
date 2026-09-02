#!/bin/sh
set -eu

# 为本机公网预览生成一次性部署密钥。不会覆盖已有 .env，也不会把密钥打印到终端。
#
# 可选环境变量：
#   PUBLIC_ORIGIN  公网访问源（写进 CORS_ORIGIN），默认 https://cps.leonote.top
#   WEB_PORT       web 容器绑定到本机回环的端口，默认 18081（compose 只绑 127.0.0.1，公网入口交给 Cloudflare Tunnel）
#   SEED_DEMO      是否灌演示数据，默认 false。显式 SEED_DEMO=true 时会额外生成随机 SEED_DEMO_PASSWORD
#                  （生产 seed.ts 强制要求，绝不再用固定口令 "demo" 面向公网）。
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"
PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-https://cps.leonote.top}
WEB_PORT=${WEB_PORT:-18081}
SEED_DEMO=${SEED_DEMO:-false}

if [ -e "$ENV_FILE" ]; then
  echo "[deploy] $ENV_FILE already exists; keeping existing secrets"
  exit 0
fi

umask 077
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

openssl genrsa -out "$TMP_DIR/youdao-platform-private.pem" 2048 >/dev/null 2>&1
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
METRICS_TOKEN=$(openssl rand -hex 24)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
# PEM 压成一行，换行写成字面 \n（compose 读 .env 不做转义展开，服务端 platform-key.ts 负责还原）。
YOUDAO_PLATFORM_PRIVATE_KEY=$(awk '{printf "%s\\n", $0}' "$TMP_DIR/youdao-platform-private.pem")

{
  printf '%s\n' 'COMPOSE_PROJECT_NAME=cps-platform'
  printf 'WEB_PORT=%s\n' "$WEB_PORT"
  printf 'CORS_ORIGIN=%s,http://localhost:%s\n' "$PUBLIC_ORIGIN" "$WEB_PORT"
  printf 'SEED_DEMO=%s\n' "$SEED_DEMO"
  if [ "$SEED_DEMO" = "true" ]; then
    # 演示账号统一口令：随机 24 hex，仅写入 .env（mode 600），不回显。
    printf 'SEED_DEMO_PASSWORD=%s\n' "$(openssl rand -hex 12)"
  fi
  printf 'JWT_ACCESS_SECRET=%s\n' "$JWT_ACCESS_SECRET"
  printf 'JWT_REFRESH_SECRET=%s\n' "$JWT_REFRESH_SECRET"
  printf 'METRICS_TOKEN=%s\n' "$METRICS_TOKEN"
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'YOUDAO_PLATFORM_PRIVATE_KEY="%s"\n' "$YOUDAO_PLATFORM_PRIVATE_KEY"
} > "$ENV_FILE"

chmod 600 "$ENV_FILE"
echo "[deploy] generated $ENV_FILE (mode 600); SEED_DEMO=$SEED_DEMO"
if [ "$SEED_DEMO" = "true" ]; then
  echo "[deploy] demo accounts enabled — password is in $ENV_FILE (SEED_DEMO_PASSWORD), not printed"
fi
