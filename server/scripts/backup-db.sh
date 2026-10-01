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
set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
PROVIDER="${DATABASE_PROVIDER:-sqlite}"
case "$BACKUP_KEEP" in ''|*[!0-9]*|0) echo "[backup] BACKUP_KEEP must be a positive integer" >&2; exit 1 ;; esac
case "$PROVIDER" in sqlite|postgresql) ;; *) echo "[backup] Unsupported database provider" >&2; exit 1 ;; esac
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
WORK=$(mktemp -d "$BACKUP_DIR/.cps-backup.XXXXXX")
trap 'rm -rf "$WORK"' EXIT HUP INT TERM
SUFFIX=${WORK##*.}

if [ "$PROVIDER" = "postgresql" ]; then
  OUT="$BACKUP_DIR/cps-pg-$STAMP-$SUFFIX.sql.gz"
  echo "[backup] Creating PostgreSQL snapshot"
  # A POSIX shell pipeline reports gzip's status, masking a failed pg_dump.
  # Complete and verify the producer first; never promote or rotate on failure.
  pg_dump --no-owner --no-privileges "${PGDATABASE:-cps}" > "$WORK/snapshot.sql"
  test -s "$WORK/snapshot.sql" || { echo "[backup] Empty database dump" >&2; exit 1; }
  gzip -c "$WORK/snapshot.sql" > "$WORK/snapshot.gz"
else
  DB="${SQLITE_DB_PATH:-/data/prod.db}"
  OUT="$BACKUP_DIR/cps-sqlite-$STAMP-$SUFFIX.db.gz"
  test -f "$DB" || { echo "[backup] SQLite database does not exist" >&2; exit 1; }
  # Work inside the private temporary directory, keeping the dot-command path fixed.
  # Resolve DB before changing directory so relative caller paths remain valid.
  case "$DB" in /*) ;; *) DB="$PWD/$DB" ;; esac
  (cd "$WORK" && sqlite3 "$DB" ".backup snapshot.db")
  test -s "$WORK/snapshot.db" || { echo "[backup] Empty SQLite snapshot" >&2; exit 1; }
  gzip -c "$WORK/snapshot.db" > "$WORK/snapshot.gz"
fi

gzip -t "$WORK/snapshot.gz"
mv "$WORK/snapshot.gz" "$OUT"
echo "[backup] Completed: $OUT"

# The configured command is trusted operator configuration. Do not echo it:
# it may contain service credentials. Quote the injected file as one argument.
if [ -n "${REMOTE_SYNC_CMD:-}" ]; then
  BACKUP_FILE=$OUT
  export BACKUP_FILE
  CMD=$(printf '%s' "$REMOTE_SYNC_CMD" | sed 's/{}/"$BACKUP_FILE"/g')
  sh -c "$CMD" || { echo "[backup] Remote sync failed; old backups retained" >&2; exit 1; }
fi

COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'cps-*.gz' | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  ls -1t "$BACKUP_DIR"/cps-*.gz | tail -n +"$((BACKUP_KEEP + 1))" | while IFS= read -r old; do
    echo "[backup] Removing retained-age snapshot: $old"
    rm -f "$old"
  done
fi
