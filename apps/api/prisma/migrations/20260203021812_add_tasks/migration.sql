-- DropForeignKey
ALTER TABLE "TaskAsset" DROP CONSTRAINT "TaskAsset_taskId_fkey";

-- AddForeignKey
ALTER TABLE "TaskAsset" ADD CONSTRAINT "TaskAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
