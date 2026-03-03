-- Link Employee with User (1:1 optional)
ALTER TABLE "Employee"
ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
