ALTER TABLE "LegacyEquipmentOrigin" ADD COLUMN "parentOriginId" TEXT;
ALTER TABLE "LegacyEquipmentOrigin" ADD CONSTRAINT "LegacyEquipmentOrigin_parentOriginId_fkey" FOREIGN KEY ("parentOriginId") REFERENCES "LegacyEquipmentOrigin"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "LegacyEquipmentOrigin" ADD CONSTRAINT "LegacyEquipmentOrigin_not_self_check" CHECK ("parentOriginId" IS DISTINCT FROM "id");
CREATE INDEX "LegacyEquipmentOrigin_parentOriginId_idx" ON "LegacyEquipmentOrigin"("parentOriginId");
