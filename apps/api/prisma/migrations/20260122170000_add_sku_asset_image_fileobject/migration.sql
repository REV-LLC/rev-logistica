ALTER TABLE "Sku" ADD COLUMN "imageFileObjectId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "imageFileObjectId" TEXT;

ALTER TABLE "Sku"
  ADD CONSTRAINT "Sku_imageFileObjectId_fkey"
  FOREIGN KEY ("imageFileObjectId") REFERENCES "FileObject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_imageFileObjectId_fkey"
  FOREIGN KEY ("imageFileObjectId") REFERENCES "FileObject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
