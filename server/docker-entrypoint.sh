#!/bin/sh
set -e

# 数据库 provider：默认 sqlite；postgresql 时用 PG schema 并重生成 client。
# Prisma 迁移目录固定在 schema 旁的 prisma/migrations/，双 provider 各存一份基线
# （SQLite=prisma/migrations，PG=prisma/migrations-pg），部署时把对应 provider 的
# 基线落到 prisma/migrations 供 migrate deploy 使用。
SCHEMA="prisma/schema.prisma"
if [ "$DATABASE_PROVIDER" = "postgresql" ]; then
  SCHEMA="prisma/schema.postgres.prisma"
  echo "[entrypoint] provider=postgresql → regenerating client for PG…"
  npx prisma generate --schema "$SCHEMA" >/dev/null 2>&1 || true
  if [ -d "prisma/migrations-pg" ]; then
    rm -rf prisma/migrations
    cp -r prisma/migrations-pg prisma/migrations
  fi
fi
MIGRATIONS_DIR="prisma/migrations"

# 应用数据库结构：
#   有迁移目录 → migrate deploy（幂等、可追溯、绝不丢数据，生产唯一正确姿势）
#   无迁移目录 → 仅非生产用 db push 兜底；生产缺迁移直接报错，杜绝 --accept-data-loss 静默毁数据
if [ -d "$MIGRATIONS_DIR" ] && [ -n "$(ls -A "$MIGRATIONS_DIR" 2>/dev/null)" ]; then
  echo "[entrypoint] applying migrations via migrate deploy ($SCHEMA)…"
  npx prisma migrate deploy --schema "$SCHEMA"
elif [ "$NODE_ENV" = "production" ]; then
  echo "[entrypoint] 生产环境缺少迁移基线（$MIGRATIONS_DIR），拒绝以 db push 修改生产库。" >&2
  echo "[entrypoint] 请先执行 prisma migrate 生成基线，再部署。" >&2
  exit 1
else
  echo "[entrypoint] 无迁移目录，非生产环境用 db push 兜底 ($SCHEMA)…"
  npx prisma db push --schema "$SCHEMA" --skip-generate
fi

# 首次（无用户）建号：
#   生产 → 仅 bootstrap 首个管理员（密码 env 注入 / 随机打印一次，首登强制改密）；
#          需要演示数据（预发/沙箱）显式 SEED_DEMO=true 才灌。
#   非生产 → 灌演示数据便于本地体验。
# 运行 seed/bootstrap：容器内用预编译 JS（prisma-dist/），本地开发回退 ts-node。
run_script() {
  base="$1" # seed | bootstrap-admin
  if [ -f "prisma-dist/prisma/$base.js" ]; then
    node "prisma-dist/prisma/$base.js"
  else
    npx ts-node "prisma/$base.ts"
  fi
}
NEED_SEED=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(c=>{console.log(c);process.exit(0)}).catch(()=>{console.log(0);process.exit(0)})")
if [ "$NEED_SEED" = "0" ]; then
  if [ "$NODE_ENV" = "production" ] && [ "$SEED_DEMO" != "true" ]; then
    echo "[entrypoint] bootstrapping first admin (生产：不灌演示数据)…"
    run_script bootstrap-admin || echo "[entrypoint] bootstrap failed (continuing)"
  else
    echo "[entrypoint] seeding demo data…"
    run_script seed || echo "[entrypoint] seed skipped/failed (continuing)"
  fi
else
  echo "[entrypoint] data present ($NEED_SEED users) — skip seed/bootstrap"
fi

echo "[entrypoint] starting: $*"
exec "$@"
