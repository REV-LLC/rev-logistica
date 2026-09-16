-- CreateEnum
CREATE TYPE "AccessoryKind" AS ENUM ('INDIVIDUAL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "AccessoryScope" AS ENUM ('FAMILY', 'SUBFAMILIES', 'ASSETS');

-- CreateEnum
CREATE TYPE "AccessoryMovementType" AS ENUM ('RECEIVE', 'ASSIGN', 'RETURN', 'TRANSFER', 'CONSUME', 'RETIRE');

-- CreateTable
CREATE TABLE "Accessory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "AccessoryKind" NOT NULL,
    "internalCode" TEXT,
    "familyId" TEXT NOT NULL,
    "scope" "AccessoryScope" NOT NULL,
    "ownerWarehouseId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creationRequestId" TEXT NOT NULL,
    "creationFingerprint" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessorySubfamily" (
    "accessoryId" TEXT NOT NULL,
    "subfamilyId" TEXT NOT NULL,

    CONSTRAINT "AccessorySubfamily_pkey" PRIMARY KEY ("accessoryId","subfamilyId")
);

-- CreateTable
CREATE TABLE "AccessoryAsset" (
    "accessoryId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "AccessoryAsset_pkey" PRIMARY KEY ("accessoryId","assetId")
);

-- CreateTable
CREATE TABLE "AccessoryBalance" (
    "id" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "locationKey" TEXT NOT NULL,
    "warehouseId" TEXT,
    "assetId" TEXT,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "AccessoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessoryMovement" (
    "id" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" "AccessoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from" JSONB,
    "to" JSONB,
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessoryRevision" (
    "id" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Accessory_internalCode_key" ON "Accessory"("internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Accessory_creationRequestId_key" ON "Accessory"("creationRequestId");

-- CreateIndex
CREATE INDEX "Accessory_familyId_active_idx" ON "Accessory"("familyId", "active");

-- CreateIndex
CREATE INDEX "AccessorySubfamily_subfamilyId_idx" ON "AccessorySubfamily"("subfamilyId");

-- CreateIndex
CREATE INDEX "AccessoryAsset_assetId_idx" ON "AccessoryAsset"("assetId");

-- CreateIndex
CREATE INDEX "AccessoryBalance_assetId_idx" ON "AccessoryBalance"("assetId");

-- CreateIndex
CREATE INDEX "AccessoryBalance_warehouseId_idx" ON "AccessoryBalance"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessoryBalance_accessoryId_locationKey_key" ON "AccessoryBalance"("accessoryId", "locationKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccessoryMovement_requestId_key" ON "AccessoryMovement"("requestId");

-- CreateIndex
CREATE INDEX "AccessoryMovement_accessoryId_createdAt_idx" ON "AccessoryMovement"("accessoryId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessoryRevision_accessoryId_createdAt_idx" ON "AccessoryRevision"("accessoryId", "createdAt");

-- AddForeignKey
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "AssetFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_ownerWarehouseId_fkey" FOREIGN KEY ("ownerWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessorySubfamily" ADD CONSTRAINT "AccessorySubfamily_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessorySubfamily" ADD CONSTRAINT "AccessorySubfamily_subfamilyId_fkey" FOREIGN KEY ("subfamilyId") REFERENCES "AssetSubfamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryAsset" ADD CONSTRAINT "AccessoryAsset_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryAsset" ADD CONSTRAINT "AccessoryAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryMovement" ADD CONSTRAINT "AccessoryMovement_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryRevision" ADD CONSTRAINT "AccessoryRevision_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Stock locations are exclusive and balances can never become negative.
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_location_check" CHECK (("warehouseId" IS NOT NULL AND "assetId" IS NULL AND "locationKey" = 'warehouse:' || "warehouseId") OR ("assetId" IS NOT NULL AND "warehouseId" IS NULL AND "locationKey" = 'asset:' || "assetId"));
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "AccessoryMovement" ADD CONSTRAINT "AccessoryMovement_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_identity_check" CHECK ((kind = 'INDIVIDUAL' AND "internalCode" IS NOT NULL AND length(trim("internalCode")) > 0) OR (kind = 'CONSUMABLE' AND "internalCode" IS NULL));
