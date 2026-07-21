-- 资金审计整改（P0-8 / P0-6 / P0-3）· SQLite
-- ⚠️ 生产执行前照例：①全库备份 ②迁移前后对账快照比对总额守恒。本迁移仅加列/加表/加索引，不改写存量金额。

-- P0-8 履约业务幂等键：Order 加 source/externalOrderId + (source, externalOrderId) 唯一约束。
--   外部平台重推同一单只入一次，不再重复累计 GMV/期数。SQLite 多 NULL 视为互不相等，
--   故存量散单（source/externalOrderId 均为 NULL）不受唯一约束影响。
ALTER TABLE "Order" ADD COLUMN "source" TEXT;
ALTER TABLE "Order" ADD COLUMN "externalOrderId" TEXT;
CREATE UNIQUE INDEX "Order_source_externalOrderId_key" ON "Order"("source", "externalOrderId");

-- P0-6 outbox 多实例认领租约：SignCallbackLog 加 lockedBy/leaseUntil，替代进程内布尔锁。
--   retrySweep 用条件 updateMany（CAS）按租约认领到期行，多副本部署不再重复投递回调。
ALTER TABLE "SignCallbackLog" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "SignCallbackLog" ADD COLUMN "leaseUntil" DATETIME;
CREATE INDEX "SignCallbackLog_deliveryStatus_leaseUntil_idx" ON "SignCallbackLog"("deliveryStatus", "leaseUntil");

-- P0-3 放款台账：每笔实际出账绑定唯一一条已审批 PayoutRequest。
--   payoutRequestId 唯一约束 = 存储层「一申请至多一放款」，兜底并发重复出账；金额恒等于审批额。
CREATE TABLE "PayoutTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "payoutRequestId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "settledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PayoutTransfer_payoutRequestId_key" ON "PayoutTransfer"("payoutRequestId");
CREATE INDEX "PayoutTransfer_agentId_status_idx" ON "PayoutTransfer"("agentId", "status");
