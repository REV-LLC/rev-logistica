CREATE TABLE "EmployeeAffiliationProvider" (
  "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL CHECK ("kind" IN ('EPS','ARL')),
  "name" VARCHAR(160) NOT NULL, "normalizedName" VARCHAR(160) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "EmployeeAffiliationProvider_kind_normalizedName_key" ON "EmployeeAffiliationProvider"("kind","normalizedName");
ALTER TABLE "Employee" ADD COLUMN "epsId" TEXT, ADD COLUMN "arlId" TEXT;
-- Preserve any affiliations entered before the catalog release. No invented entities.
WITH values_to_import AS (
 SELECT 'EPS' AS kind, regexp_replace(btrim(eps), '\s+', ' ', 'g') AS name FROM "Employee" WHERE nullif(btrim(eps),'') IS NOT NULL
 UNION ALL
 SELECT 'ARL', regexp_replace(btrim(arl), '\s+', ' ', 'g') FROM "Employee" WHERE nullif(btrim(arl),'') IS NOT NULL
), distinct_values AS (
 SELECT kind, lower(name) AS normalized_name, min(name) AS name FROM values_to_import GROUP BY kind, lower(name)
)
INSERT INTO "EmployeeAffiliationProvider"("id","kind","name","normalizedName","updatedAt")
 SELECT gen_random_uuid()::text, kind, name, normalized_name, CURRENT_TIMESTAMP FROM distinct_values;
UPDATE "Employee" e SET "epsId"=p.id, eps=p.name FROM "EmployeeAffiliationProvider" p WHERE p.kind='EPS' AND p."normalizedName"=lower(regexp_replace(btrim(e.eps),'\s+',' ','g'));
UPDATE "Employee" e SET "arlId"=p.id, arl=p.name FROM "EmployeeAffiliationProvider" p WHERE p.kind='ARL' AND p."normalizedName"=lower(regexp_replace(btrim(e.arl),'\s+',' ','g'));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_epsId_fkey" FOREIGN KEY ("epsId") REFERENCES "EmployeeAffiliationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_arlId_fkey" FOREIGN KEY ("arlId") REFERENCES "EmployeeAffiliationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Employee_epsId_idx" ON "Employee"("epsId");
CREATE INDEX "Employee_arlId_idx" ON "Employee"("arlId");
