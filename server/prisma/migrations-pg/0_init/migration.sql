-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'platform',
    "scopeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ua" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '系统',
    "role" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "detail" TEXT NOT NULL DEFAULT '',
    "before" TEXT,
    "after" TEXT,
    "ip" TEXT NOT NULL DEFAULT '',
    "ua" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL DEFAULT 'org',
    "name" TEXT NOT NULL DEFAULT '网易有道',
    "license" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mark" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review',
    "path" TEXT NOT NULL DEFAULT 'direct',
    "feeRate" DOUBLE PRECISION NOT NULL,
    "period" INTEGER NOT NULL,
    "reservePct" INTEGER NOT NULL,
    "gmvMtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activeSubs" INTEGER NOT NULL DEFAULT 0,
    "renewalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaintRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "joinedAt" TEXT NOT NULL,
    "apiCallbackUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "custId" TEXT NOT NULL DEFAULT '',
    "merchantId" TEXT NOT NULL DEFAULT '',
    "publicKey" TEXT NOT NULL DEFAULT '',
    "publicKeyHash" TEXT NOT NULL DEFAULT '',
    "publicKeyHint" TEXT NOT NULL DEFAULT '',
    "keySource" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "creditScore" INTEGER NOT NULL DEFAULT 800,
    "spendMtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstOrders" INTEGER NOT NULL DEFAULT 0,
    "roi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renewalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaintRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payoutPending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "settledTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandsCount" INTEGER NOT NULL DEFAULT 0,
    "invoicing" TEXT NOT NULL DEFAULT '灵活用工',
    "joinedAt" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAccount" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'healthy',
    "complaintRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalatedRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chargebackRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "refundRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "close72h" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "gmvMtd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "limitUsedPct" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MerchantAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "plan" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "productId" TEXT,
    "bundleId" TEXT,
    "signOrderNo" TEXT,
    "extOrderNo" TEXT,
    "period" INTEGER,
    "refundedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "gross" DOUBLE PRECISION NOT NULL,
    "brandShare" DOUBLE PRECISION NOT NULL,
    "platformFee" DOUBLE PRECISION NOT NULL,
    "agentPayout" DOUBLE PRECISION NOT NULL,
    "reserve" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reversal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frozen" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reconcileDiff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractId" TEXT,
    "agentShareSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserveReleased" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserveClawedBack" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "slaLeftMin" INTEGER NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '未分配',
    "handlePlan" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "handledBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthContract" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentId" TEXT,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settleModel" TEXT NOT NULL,
    "settleParams" TEXT NOT NULL DEFAULT '{}',
    "userLimit" TEXT NOT NULL DEFAULT '{}',
    "ltvWindow" TEXT NOT NULL DEFAULT 'D30',
    "complaintLiability" TEXT NOT NULL DEFAULT 'agent',
    "reservePct" INTEGER NOT NULL DEFAULT 10,
    "reserveReleaseRule" TEXT NOT NULL DEFAULT '{}',
    "breachRule" TEXT NOT NULL DEFAULT '',
    "targetGmv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "achievedGmv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "productId" TEXT,
    "userRef" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstOrderId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriod" INTEGER NOT NULL DEFAULT 1,
    "lastRenewAt" TIMESTAMP(3),
    "churnedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "winbackAt" TIMESTAMP(3),
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignOrder" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "plan" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT NOT NULL DEFAULT '',
    "payChannel" TEXT NOT NULL DEFAULT 'alipay',
    "status" TEXT NOT NULL DEFAULT 'signing',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentPeriod" INTEGER NOT NULL DEFAULT 0,
    "subscriptionId" TEXT,
    "extraInfo" TEXT NOT NULL DEFAULT '',
    "appId" TEXT NOT NULL DEFAULT '',
    "custOrderId" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT NOT NULL DEFAULT '',
    "env" TEXT NOT NULL DEFAULT 'prod',
    "signedAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "unsignedAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SignOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeRetry" (
    "id" TEXT NOT NULL,
    "signOrderNo" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "period" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL DEFAULT '',
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "lastTriedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeRetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignCallbackLog" (
    "id" TEXT NOT NULL,
    "signOrderNo" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignCallbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveRelease" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "contractId" TEXT,
    "agentId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "releasedAt" TIMESTAMP(3),
    "releasedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarterDeal" (
    "id" TEXT NOT NULL,
    "initiatorBrandId" TEXT NOT NULL,
    "counterpartyBrandId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "resourceType" TEXT NOT NULL,
    "myQuota" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "counterpartyQuota" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceStatus" TEXT NOT NULL DEFAULT 'pending',
    "terms" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BarterDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "firstPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renewPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultSharePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "bundleEligible" BOOLEAN NOT NULL DEFAULT true,
    "exclusiveGroup" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "userRef" TEXT NOT NULL DEFAULT '',
    "productIds" TEXT NOT NULL,
    "listPrice" DOUBLE PRECISION NOT NULL,
    "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "ruleId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt" TIMESTAMP(3),
    "payChannel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'count_off',
    "params" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BundleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "scopeType" TEXT NOT NULL DEFAULT 'platform',
    "scopeId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "productId" TEXT,
    "contractId" TEXT,
    "channel" TEXT NOT NULL DEFAULT '',
    "trackingUrl" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstOrders" INTEGER NOT NULL DEFAULT 0,
    "payout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "agentId" TEXT,
    "contractId" TEXT,
    "productId" TEXT,
    "assetType" TEXT NOT NULL,
    "jobId" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'generated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_account_key" ON "User"("account");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_appId_key" ON "ApiCredential"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAccount_mid_key" ON "MerchantAccount"("mid");

-- CreateIndex
CREATE UNIQUE INDEX "Order_refundedOrderId_key" ON "Order"("refundedOrderId");

-- CreateIndex
CREATE INDEX "Order_brandId_idx" ON "Order"("brandId");

-- CreateIndex
CREATE INDEX "Order_agentId_idx" ON "Order"("agentId");

-- CreateIndex
CREATE INDEX "Order_subscriptionId_idx" ON "Order"("subscriptionId");

-- CreateIndex
CREATE INDEX "Order_signOrderNo_idx" ON "Order"("signOrderNo");

-- CreateIndex
CREATE INDEX "Order_extOrderNo_idx" ON "Order"("extOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_period_brandId_key" ON "Settlement"("period", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_brandId_agentId_plan_key" ON "Subscription"("brandId", "agentId", "plan");

-- CreateIndex
CREATE INDEX "SignOrder_custOrderId_idx" ON "SignOrder"("custOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_trackingCode_key" ON "Claim"("trackingCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

