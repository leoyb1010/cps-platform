#!/bin/sh
# 资金库定时备份 —— SQLite / PostgreSQL 双支持。
#
# 用法（宿主机 cron，每天 02:30）：
#   30 2 * * *  /path/to/server/scripts/backup-db.sh >> /var/log/cps-backup.log 2>&1
#
# 环境变量：
#   BACKUP_DIR       备份落盘目录（默认 ./backups）
#   BACKUP_KEEP      本地保留份数（默认 14，超出按时间清理）
#   DATABASE_PROVIDER  sqlite（默认）| postgresql
#   SQLITE_DB_PATH   SQLite 库路径（默认 /data/prod.db，与 compose 卷一致）
#   PG_*             PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE（pg_dump 标准变量）
#   REMOTE_SYNC_CMD  可选：异地同步命令模板，用 {} 占位备份文件，如
#                    'aws s3 cp {} s3://my-bucket/cps/'  或  'rclone copy {} nas:cps/'
#
# 退出码非 0 表示备份失败，cron 应告警（配合监控/邮件）。
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
PROVIDER="${DATABASE_PROVIDER:-sqlite}"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

if [ "$PROVIDER" = "postgresql" ]; then
  OUT="$BACKUP_DIR/cps-pg-$STAMP.sql.gz"
  echo "[backup] pg_dump → $OUT"
  # -Fc 自定义格式更利于 pg_restore 选择性恢复；此处用纯 SQL + gzip 便于跨环境
  pg_dump --no-owner --no-privileges "${PGDATABASE:-cps}" | gzip > "$OUT"
else
  DB="${SQLITE_DB_PATH:-/data/prod.db}"
  OUT="$BACKUP_DIR/cps-sqlite-$STAMP.db"
  echo "[backup] sqlite .backup $DB → $OUT"
  if [ ! -f "$DB" ]; then
    echo "[backup] 数据库文件不存在：$DB" >&2
    exit 1
  fi
  # sqlite3 .backup 是热备（对在写库安全），优于直接 cp
  sqlite3 "$DB" ".backup '$OUT'"
  gzip -f "$OUT"
  OUT="$OUT.gz"
fi

# 校验产物非空
if [ ! -s "$OUT" ]; then
  echo "[backup] 备份产物为空，判定失败：$OUT" >&2
  exit 1
fi
echo "[backup] 完成：$OUT ($(du -h "$OUT" | cut -f1))"

# 异地同步（可选）
if [ -n "$REMOTE_SYNC_CMD" ]; then
  CMD=$(echo "$REMOTE_SYNC_CMD" | sed "s#{}#$OUT#g")
  echo "[backup] 异地同步：$CMD"
  sh -c "$CMD" || { echo "[backup] 异地同步失败" >&2; exit 1; }
fi

# 本地滚动清理：仅保留最近 BACKUP_KEEP 份
COUNT=$(ls -1t "$BACKUP_DIR"/cps-*.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  ls -1t "$BACKUP_DIR"/cps-*.gz | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
    echo "[backup] 清理旧备份：$old"
    rm -f "$old"
  done
fi
