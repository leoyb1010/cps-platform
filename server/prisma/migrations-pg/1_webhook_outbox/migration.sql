-- 回调投递准 outbox：给 SignCallbackLog 加重试字段（PG 直接 ADD COLUMN，无需重建表）
ALTER TABLE "SignCallbackLog" ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SignCallbackLog" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SignCallbackLog" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "SignCallbackLog" ADD COLUMN "callbackUrl" TEXT NOT NULL DEFAULT '';

-- 重投 sweep 扫描索引
CREATE INDEX "SignCallbackLog_deliveryStatus_nextRetryAt_idx" ON "SignCallbackLog"("deliveryStatus", "nextRetryAt");
