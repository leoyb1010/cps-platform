#!/bin/sh
set -eu

# 为本机公网预览生成一次性部署密钥。不会覆盖已有 .env，也不会把密钥打印到终端。
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"

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
YOUDAO_PLATFORM_PRIVATE_KEY=$(awk '{printf "%s\\\\n", $0}' "$TMP_DIR/youdao-platform-private.pem")

{
  printf '%s\n' 'COMPOSE_PROJECT_NAME=cps-platform'
  printf '%s\n' 'WEB_PORT=18081'
  printf '%s\n' 'CORS_ORIGIN=https://cps.leonote.top,http://localhost:18081'
  printf '%s\n' 'SEED_DEMO=true'
  printf 'JWT_ACCESS_SECRET=%s\n' "$JWT_ACCESS_SECRET"
  printf 'JWT_REFRESH_SECRET=%s\n' "$JWT_REFRESH_SECRET"
  printf 'METRICS_TOKEN=%s\n' "$METRICS_TOKEN"
  printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  printf 'YOUDAO_PLATFORM_PRIVATE_KEY="%s"\n' "$YOUDAO_PLATFORM_PRIVATE_KEY"
} > "$ENV_FILE"

chmod 600 "$ENV_FILE"
echo "[deploy] generated $ENV_FILE (mode 600)"
