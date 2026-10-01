ALTER TABLE "RefreshToken" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "RefreshToken" SET "tokenVersion" = COALESCE((SELECT "tokenVersion" FROM "User" WHERE "User"."id" = "RefreshToken"."userId"), 0);
