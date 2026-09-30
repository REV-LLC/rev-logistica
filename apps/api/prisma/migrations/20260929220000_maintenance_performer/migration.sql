ALTER TABLE "MaintenanceCompletion" ADD COLUMN "performedByUserId" TEXT;
ALTER TABLE "MaintenanceCompletion" ADD CONSTRAINT "MaintenanceCompletion_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
