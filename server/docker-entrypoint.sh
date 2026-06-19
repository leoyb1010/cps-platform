#!/bin/sh
set -e

echo "[entrypoint] applying schema (prisma db push)…"
npx prisma db push --skip-generate --accept-data-loss

# 仅首次（无用户）时灌种子，避免每次重启清掉运行数据
NEED_SEED=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>{console.log(0);process.exit(0)})")
if [ "$NEED_SEED" = "0" ]; then
  echo "[entrypoint] seeding demo data…"
  npx ts-node prisma/seed.ts || echo "[entrypoint] seed skipped/failed (continuing)"
else
  echo "[entrypoint] data present ($NEED_SEED users) — skip seed"
fi

echo "[entrypoint] starting: $*"
exec "$@"
