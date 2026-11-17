-- Run with psql -v ON_ERROR_STOP=1 -f apps/api/test/annex-code-year.sql against a LOCAL test database.
-- All fixtures live in a disposable schema. No application tables are changed.
\set ON_ERROR_STOP on
SELECT format('annex_code_year_test_%s', pg_backend_pid()) AS test_schema \gset
CREATE SCHEMA :"test_schema";
SET search_path TO :"test_schema";
CREATE TABLE "Customer" (id text PRIMARY KEY);
CREATE TABLE "CustomerWorksite" (id text PRIMARY KEY, "customerId" text NOT NULL REFERENCES "Customer"(id));
CREATE TABLE "AnnexDraft" (id text PRIMARY KEY, "customerWorksiteId" text NOT NULL, "periodFrom" date NOT NULL, "periodTo" date NOT NULL, revision integer NOT NULL DEFAULT 1, "createdAt" timestamp DEFAULT now());
CREATE TABLE "AnnexDraftRevision" ("draftId" text, revision integer, through date);
INSERT INTO "Customer" VALUES ('client');
INSERT INTO "CustomerWorksite" VALUES ('site-a','client'),('site-b','client');
INSERT INTO "AnnexDraft" (id,"customerWorksiteId","periodFrom","periodTo") VALUES ('saved-2026','site-a','2026-11-01','2026-11-15');
\ir ../prisma/migrations/20261117190000_annex_consultation_codes/migration.sql
CREATE TEMP TABLE original_codes AS SELECT "code","periodFrom","periodTo","customerWorksiteId" FROM "AnnexConsultationCode";
\ir ../prisma/migrations/20261117200000_annex_code_year/migration.sql
DO $$
DECLARE old_code text; other_code text; next_code text;
BEGIN
  IF EXISTS (SELECT * FROM original_codes EXCEPT SELECT "code","periodFrom","periodTo","customerWorksiteId" FROM "AnnexConsultationCode") THEN
    RAISE EXCEPTION 'Migration changed existing codes';
  END IF;
  old_code := reserve_annex_code('site-a','2026-11-01','2026-11-15','2026-11-15');
  next_code := reserve_annex_code('site-a','2027-11-01','2027-11-15','2027-11-15');
  IF old_code <> '001111' OR next_code <> old_code THEN RAISE EXCEPTION 'Year must not add digits to a reused code'; END IF;
  IF reserve_annex_code('site-a','2027-11-01','2027-11-15','2027-11-15') <> next_code THEN RAISE EXCEPTION 'Reservation is not idempotent'; END IF;
  other_code := reserve_annex_code('site-b','2027-11-01','2027-11-15','2027-11-15');
  IF other_code <> '0011112' THEN RAISE EXCEPTION 'Worksites must remain distinct within the same year'; END IF;
  INSERT INTO "AnnexDraft" (id,"customerWorksiteId","periodFrom","periodTo") VALUES ('saved-2027','site-a','2027-11-01','2027-11-15');
  IF (SELECT count(*) FROM "AnnexDraft" WHERE "annexCode"='001111') <> 2 THEN RAISE EXCEPTION 'Drafts cannot reuse a code in different years'; END IF;
  IF (SELECT count(*) FROM "AnnexDraft" d JOIN "AnnexConsultationCode" c ON c.year=d."annexYear" AND c.code=d."annexCode" WHERE c."periodFrom"=d."periodFrom") <> 2 THEN RAISE EXCEPTION 'Draft linked to the wrong year'; END IF;
  BEGIN
    UPDATE "AnnexDraft" SET "annexYear"=2027 WHERE id='saved-2026';
    RAISE EXCEPTION 'Accepted mismatched year';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET search_path;
DROP SCHEMA :"test_schema" CASCADE;
\echo 'Annex codes by year: passed'
