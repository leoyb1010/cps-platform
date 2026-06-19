#!/bin/sh
# 校验 sqlite / postgres 两份 schema 的模型体一致（仅 datasource 允许不同）。
# 改了模型只改一处时，此检查会失败，提醒同步另一份。
set -e
cd "$(dirname "$0")/.."
extract() { awk 'f{print} /^}/{if(d){f=1; d=0}} /^datasource db/{d=1}' "$1"; }
A=$(mktemp); B=$(mktemp)
trap 'rm -f "$A" "$B"' EXIT
extract prisma/schema.prisma > "$A"
extract prisma/schema.postgres.prisma > "$B"
if diff "$A" "$B" >/dev/null; then
  echo "✓ schema.prisma 与 schema.postgres.prisma 模型体一致"
else
  echo "✗ 两份 schema 模型体不一致 —— 请同步 prisma/schema.postgres.prisma" >&2
  diff "$A" "$B" || true
  exit 1
fi
