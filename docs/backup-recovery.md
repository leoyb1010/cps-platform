# 数据备份与恢复（Runbook）

> 资金/结算数据不可再生。本文定义备份策略、恢复步骤与演练要求。上线前必须完成一次真实恢复演练。

## 1. 备份策略

| 项 | 值 |
|---|---|
| 工具 | `server/scripts/backup-db.sh`（SQLite `.backup` 热备 / PostgreSQL `pg_dump`，均 gzip） |
| 频率 | 每日 02:30（cron）；结算跑批日建议加一次批后备份 |
| 本地保留 | 默认 14 份滚动（`BACKUP_KEEP`） |
| 异地 | 必须配置 `REMOTE_SYNC_CMD` 同步到对象存储/NAS（本地卷误删=全失） |
| RPO 目标 | ≤ 24h（日备）；对资金库建议缩到 ≤ 1h（见 §4 PITR） |
| RTO 目标 | ≤ 1h（从备份恢复并重启服务） |

### 定时任务（宿主机 crontab）

```cron
# SQLite 部署
30 2 * * *  DATABASE_PROVIDER=sqlite SQLITE_DB_PATH=/var/lib/docker/volumes/cps_cps-db/_data/prod.db \
            BACKUP_DIR=/backup/cps REMOTE_SYNC_CMD='rclone copy {} nas:cps/' \
            /opt/cps/server/scripts/backup-db.sh >> /var/log/cps-backup.log 2>&1

# PostgreSQL 部署
30 2 * * *  DATABASE_PROVIDER=postgresql PGHOST=127.0.0.1 PGUSER=cps PGDATABASE=cps PGPASSWORD=*** \
            BACKUP_DIR=/backup/cps REMOTE_SYNC_CMD='aws s3 cp {} s3://cps-backup/db/' \
            /opt/cps/server/scripts/backup-db.sh >> /var/log/cps-backup.log 2>&1
```

> cron 失败（非 0 退出）需接告警：把 `backup-db.sh` 的退出码接入监控（如 healthchecks.io 心跳、或日志告警规则）。**静默的备份失败等于没有备份。**

### 容器内运行（可选）

备份工具依赖 `sqlite3` / `pg_dump`。SQLite 生产镜像已含 Prisma 引擎但未必有 `sqlite3` CLI——推荐在**宿主机**对挂载卷执行（路径见上），或用一次性容器：
```sh
docker run --rm -v cps_cps-db:/data -v /backup/cps:/backup nouchka/sqlite3 \
  sqlite3 /data/prod.db ".backup '/backup/prod-$(date +%F).db'"
```

## 2. 恢复步骤 — SQLite

```sh
# 1) 停服务，避免恢复中写入
docker compose stop server

# 2) 取备份并解压
gunzip -c /backup/cps/cps-sqlite-YYYYMMDD-HHMMSS.db.gz > /tmp/prod.db

# 3) 校验备份是完整 sqlite 且含数据（关键表非空）
sqlite3 /tmp/prod.db "SELECT count(*) FROM User; SELECT count(*) FROM Settlement;"

# 4) 覆盖卷中的库（先备份当前坏库以防误判）
VOL=/var/lib/docker/volumes/cps_cps-db/_data
mv "$VOL/prod.db" "$VOL/prod.db.broken-$(date +%s)"
cp /tmp/prod.db "$VOL/prod.db"

# 5) 重启并验证
docker compose start server
curl -fsS http://localhost:8080/api/ready   # 期望 200，含 DB 连通 + 审计写入自检
```

## 3. 恢复步骤 — PostgreSQL

```sh
# 1) 停应用容器（保留 db 容器）
docker compose -f docker-compose.pg.yml stop server

# 2) 解压
gunzip -c /backup/cps/cps-pg-YYYYMMDD-HHMMSS.sql.gz > /tmp/cps.sql

# 3) 恢复到新库（不要直接覆盖生产库，先建 restore 库核对）
docker compose -f docker-compose.pg.yml exec db psql -U cps -c "CREATE DATABASE cps_restore;"
docker compose -f docker-compose.pg.yml exec -T db psql -U cps -d cps_restore < /tmp/cps.sql
# 核对行数无误后，切换：改 DATABASE_URL 指向 cps_restore，或 rename 交换

# 4) 重启并验证 /ready
docker compose -f docker-compose.pg.yml start server
```

## 4. 增强项（上线后迭代）

- **PITR / WAL 归档**（PG）：`archive_mode=on` + `archive_command` 归档 WAL，将 RPO 从 24h 降到分钟级；配合基础备份可恢复到任意时间点。
- **备份加密**：异地前 `gpg` 加密，避免备份泄露即数据泄露。
- **恢复演练**：每季度从异地备份完整恢复到隔离环境一次，记录实际 RTO，验证备份可用性（未验证的备份不算备份）。

## 5. 迁移与数据结构变更安全

- 生产结构变更**只走** `prisma migrate deploy`（迁移基线见 `server/prisma/migrations/` SQLite、`server/prisma/migrations-pg/` PostgreSQL）。
- 禁止在生产用 `prisma db push --accept-data-loss`（会静默丢列/清表）。`docker-entrypoint.sh` 已强制：生产缺迁移目录直接拒绝启动。
- 任何删列/改类型的迁移，上线前必须先在恢复演练环境跑一遍并确认数据无损。

---

## 上线前检查清单（Definition of Done）

- [ ] cron 已配置且首次成功产出备份文件
- [ ] `REMOTE_SYNC_CMD` 已配置，异地能看到备份
- [ ] 备份失败已接入告警
- [ ] 完成一次真实恢复演练（记录 RTO）
- [ ] 迁移基线随镜像发布，`migrate deploy` 在预发验证通过
