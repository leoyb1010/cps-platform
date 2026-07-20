-- P1-B7 金额精度：Float(元) → Int(整数分)。现有金额 ×100 一次性落定（ROUND 消除历史浮点尾差）。
-- ⚠️ 生产执行前务必：①全库备份（docs/backup-recovery.md）②迁移前跑对账快照，迁移后比对总额守恒。回滚：col/100.0 复原。

ALTER TABLE "Brand" ALTER COLUMN "gmvMtd" TYPE INTEGER USING ROUND("gmvMtd" * 100);
ALTER TABLE "Agent" ALTER COLUMN "spendMtd" TYPE INTEGER USING ROUND("spendMtd" * 100);
ALTER TABLE "Agent" ALTER COLUMN "payoutPending" TYPE INTEGER USING ROUND("payoutPending" * 100);
ALTER TABLE "Agent" ALTER COLUMN "settledTotal" TYPE INTEGER USING ROUND("settledTotal" * 100);
ALTER TABLE "Agent" ALTER COLUMN "deposit" TYPE INTEGER USING ROUND("deposit" * 100);
ALTER TABLE "MerchantAccount" ALTER COLUMN "gmvMtd" TYPE INTEGER USING ROUND("gmvMtd" * 100);
ALTER TABLE "Order" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "gross" TYPE INTEGER USING ROUND("gross" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "brandShare" TYPE INTEGER USING ROUND("brandShare" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "platformFee" TYPE INTEGER USING ROUND("platformFee" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "agentPayout" TYPE INTEGER USING ROUND("agentPayout" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "reserve" TYPE INTEGER USING ROUND("reserve" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "reversal" TYPE INTEGER USING ROUND("reversal" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "frozen" TYPE INTEGER USING ROUND("frozen" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "reconcileDiff" TYPE INTEGER USING ROUND("reconcileDiff" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "reserveReleased" TYPE INTEGER USING ROUND("reserveReleased" * 100);
ALTER TABLE "Settlement" ALTER COLUMN "reserveClawedBack" TYPE INTEGER USING ROUND("reserveClawedBack" * 100);
ALTER TABLE "GrowthContract" ALTER COLUMN "targetGmv" TYPE INTEGER USING ROUND("targetGmv" * 100);
ALTER TABLE "GrowthContract" ALTER COLUMN "achievedGmv" TYPE INTEGER USING ROUND("achievedGmv" * 100);
ALTER TABLE "Subscription" ALTER COLUMN "mrr" TYPE INTEGER USING ROUND("mrr" * 100);
ALTER TABLE "SignOrder" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
ALTER TABLE "ChargeRetry" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
ALTER TABLE "ReserveRelease" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
ALTER TABLE "ReserveRelease" ALTER COLUMN "releasedAmount" TYPE INTEGER USING ROUND("releasedAmount" * 100);
ALTER TABLE "BarterDeal" ALTER COLUMN "myQuota" TYPE INTEGER USING ROUND("myQuota" * 100);
ALTER TABLE "BarterDeal" ALTER COLUMN "counterpartyQuota" TYPE INTEGER USING ROUND("counterpartyQuota" * 100);
ALTER TABLE "Product" ALTER COLUMN "firstPrice" TYPE INTEGER USING ROUND("firstPrice" * 100);
ALTER TABLE "Product" ALTER COLUMN "renewPrice" TYPE INTEGER USING ROUND("renewPrice" * 100);
ALTER TABLE "Bundle" ALTER COLUMN "listPrice" TYPE INTEGER USING ROUND("listPrice" * 100);
ALTER TABLE "Bundle" ALTER COLUMN "finalPrice" TYPE INTEGER USING ROUND("finalPrice" * 100);
ALTER TABLE "Claim" ALTER COLUMN "spend" TYPE INTEGER USING ROUND("spend" * 100);
ALTER TABLE "Claim" ALTER COLUMN "payout" TYPE INTEGER USING ROUND("payout" * 100);
ALTER TABLE "PayoutRequest" ALTER COLUMN "amount" TYPE INTEGER USING ROUND("amount" * 100);
