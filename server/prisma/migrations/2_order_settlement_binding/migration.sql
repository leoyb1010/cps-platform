ALTER TABLE "Order" ADD COLUMN "settlementId" TEXT REFERENCES "Settlement"("id") ON DELETE SET NULL;

CREATE INDEX "Order_settlementId_idx" ON "Order"("settlementId");

-- 冻结存量退款分润比例；agentPayout + reversal 还原冲账前原始代理分润。
UPDATE "Settlement"
SET "agentShareSnapshot" = ("agentPayout" + "reversal") / "gross"
WHERE "agentShareSnapshot" = 0 AND "gross" > 0;
