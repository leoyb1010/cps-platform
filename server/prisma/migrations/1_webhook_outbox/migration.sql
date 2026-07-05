-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SignCallbackLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signOrderNo" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "httpStatus" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT NOT NULL DEFAULT '',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" DATETIME,
    "callbackUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SignCallbackLog" ("brandId", "createdAt", "direction", "error", "httpStatus", "id", "ok", "payload", "signOrderNo", "status") SELECT "brandId", "createdAt", "direction", "error", "httpStatus", "id", "ok", "payload", "signOrderNo", "status" FROM "SignCallbackLog";
DROP TABLE "SignCallbackLog";
ALTER TABLE "new_SignCallbackLog" RENAME TO "SignCallbackLog";
CREATE INDEX "SignCallbackLog_deliveryStatus_nextRetryAt_idx" ON "SignCallbackLog"("deliveryStatus", "nextRetryAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

