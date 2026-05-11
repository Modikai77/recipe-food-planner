CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');

CREATE TABLE "Household" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultLocale" TEXT NOT NULL DEFAULT 'en-GB',
  "measurementPref" TEXT NOT NULL DEFAULT 'UK',
  "conversionPrefs" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdMember" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdInvite" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "householdId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Recipe" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Recipe" ADD COLUMN "createdByTokenId" TEXT;
ALTER TABLE "Recipe" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Recipe" DROP CONSTRAINT IF EXISTS "Recipe_userId_fkey";

ALTER TABLE "Tag" ADD COLUMN "householdId" TEXT;
ALTER TABLE "Tag" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_userId_fkey";

ALTER TABLE "IngestionJob" ADD COLUMN "householdId" TEXT;
ALTER TABLE "IngestionJob" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "IngestionJob" ADD COLUMN "createdByTokenId" TEXT;
ALTER TABLE "IngestionJob" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "IngestionJob" DROP CONSTRAINT IF EXISTS "IngestionJob_userId_fkey";

ALTER TABLE "MealPlan" ADD COLUMN "householdId" TEXT;
ALTER TABLE "MealPlan" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "MealPlan" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "MealPlan" DROP CONSTRAINT IF EXISTS "MealPlan_userId_fkey";

ALTER TABLE "ShoppingList" ADD COLUMN "householdId" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "createdByTokenId" TEXT;
ALTER TABLE "ShoppingList" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ShoppingList" DROP CONSTRAINT IF EXISTS "ShoppingList_userId_fkey";

INSERT INTO "Household" (
  "id",
  "name",
  "defaultLocale",
  "measurementPref",
  "conversionPrefs",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('hh_', md5("id")),
  concat(split_part("email", '@', 1), '''s household'),
  "locale",
  "measurementPref",
  "conversionPrefs",
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "HouseholdMember" (
  "id",
  "householdId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('hm_', md5("id")),
  concat('hh_', md5("id")),
  "id",
  'OWNER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT DO NOTHING;

UPDATE "Recipe"
SET
  "householdId" = concat('hh_', md5("userId")),
  "createdByUserId" = "userId"
WHERE "userId" IS NOT NULL AND "householdId" IS NULL;

UPDATE "Tag"
SET "householdId" = concat('hh_', md5("userId"))
WHERE "userId" IS NOT NULL AND "householdId" IS NULL;

UPDATE "IngestionJob"
SET
  "householdId" = concat('hh_', md5("userId")),
  "createdByUserId" = "userId"
WHERE "userId" IS NOT NULL AND "householdId" IS NULL;

UPDATE "MealPlan"
SET
  "householdId" = concat('hh_', md5("userId")),
  "createdByUserId" = "userId"
WHERE "userId" IS NOT NULL AND "householdId" IS NULL;

UPDATE "ShoppingList"
SET
  "householdId" = concat('hh_', md5("userId")),
  "createdByUserId" = "userId"
WHERE "userId" IS NOT NULL AND "householdId" IS NULL;

CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");
CREATE UNIQUE INDEX "HouseholdInvite_tokenHash_key" ON "HouseholdInvite"("tokenHash");
CREATE INDEX "HouseholdInvite_householdId_email_idx" ON "HouseholdInvite"("householdId", "email");
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_householdId_revokedAt_idx" ON "ApiToken"("householdId", "revokedAt");
CREATE INDEX "Recipe_householdId_mealType_idx" ON "Recipe"("householdId", "mealType");
CREATE INDEX "Recipe_householdId_vegetarian_glutenFree_idx" ON "Recipe"("householdId", "vegetarian", "glutenFree");
DROP INDEX IF EXISTS "Tag_userId_name_key";
CREATE UNIQUE INDEX "Tag_householdId_name_key" ON "Tag"("householdId", "name");
CREATE INDEX "IngestionJob_householdId_status_createdAt_idx" ON "IngestionJob"("householdId", "status", "createdAt");

ALTER TABLE "Household" ADD CONSTRAINT "Household_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_createdByTokenId_fkey" FOREIGN KEY ("createdByTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_createdByTokenId_fkey" FOREIGN KEY ("createdByTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_createdByTokenId_fkey" FOREIGN KEY ("createdByTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
