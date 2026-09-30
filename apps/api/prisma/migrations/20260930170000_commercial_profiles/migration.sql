CREATE TABLE "CommercialProfile" (
 "id" TEXT NOT NULL, "scopeType" TEXT NOT NULL, "scopeId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "CommercialProfile_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CommercialProfile_scopeType_check" CHECK ("scopeType" IN ('ASSET','SKU','FAMILY'))
);
CREATE UNIQUE INDEX "CommercialProfile_scopeType_scopeId_key" ON "CommercialProfile"("scopeType","scopeId");
CREATE TABLE "CommercialProfileRevision" (
 "id" TEXT NOT NULL,"profileId" TEXT NOT NULL,"version" INTEGER NOT NULL,"effectiveFrom" DATE NOT NULL,
 "payload" JSONB NOT NULL,"createdBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CommercialProfileRevision_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CommercialProfileRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CommercialProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommercialProfileRevision_profileId_version_key" ON "CommercialProfileRevision"("profileId","version");
CREATE INDEX "CommercialProfileRevision_profileId_effectiveFrom_idx" ON "CommercialProfileRevision"("profileId","effectiveFrom");
ALTER TABLE "DocumentItem" ADD COLUMN "commercialSnapshot" JSONB;
