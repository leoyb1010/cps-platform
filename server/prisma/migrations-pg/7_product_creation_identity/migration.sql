ALTER TABLE "Product" ADD COLUMN "creationKey" TEXT;
ALTER TABLE "Product" ADD COLUMN "creationFingerprint" TEXT;
CREATE UNIQUE INDEX "Product_creationKey_key" ON "Product"("creationKey");
