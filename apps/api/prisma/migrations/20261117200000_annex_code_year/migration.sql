BEGIN;

-- Preserve every existing number. Only its uniqueness scope becomes annual.
ALTER TABLE "AnnexConsultationCode" ADD COLUMN "year" INTEGER;
UPDATE "AnnexConsultationCode" SET "year" = extract(year FROM "periodFrom")::integer;
ALTER TABLE "AnnexConsultationCode" ALTER COLUMN "year" SET NOT NULL,
  ADD CONSTRAINT "AnnexConsultationCode_year_check" CHECK ("year" = extract(year FROM "periodFrom")::integer);
ALTER TABLE "AnnexDraft" ADD COLUMN "annexYear" INTEGER;
UPDATE "AnnexDraft" SET "annexYear" = extract(year FROM "periodFrom")::integer;
ALTER TABLE "AnnexDraft" ALTER COLUMN "annexYear" SET NOT NULL,
  ADD CONSTRAINT "AnnexDraft_annexYear_check" CHECK ("annexYear" = extract(year FROM "periodFrom")::integer);

ALTER TABLE "AnnexDraft" DROP CONSTRAINT "AnnexDraft_annexCode_fkey",
  DROP CONSTRAINT "AnnexDraft_annexCode_key";
ALTER TABLE "AnnexConsultationCode" DROP CONSTRAINT "AnnexConsultationCode_pkey",
  DROP CONSTRAINT "AnnexConsultationCode_baseCode_ordinal_key",
  ADD PRIMARY KEY ("year", "code"),
  ADD UNIQUE ("year", "baseCode", "ordinal");
ALTER TABLE "AnnexDraft" ADD UNIQUE ("annexYear", "annexCode"),
  ADD FOREIGN KEY ("annexYear", "annexCode") REFERENCES "AnnexConsultationCode"("year", "code") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION reserve_annex_code(site_id text, start_day date, end_day date, data_day date)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  assigned text;
  client_id text;
  client_prefix integer;
  month_end date := (date_trunc('month', start_day) + interval '1 month - 1 day')::date;
  base text;
  next_ordinal integer;
BEGIN
  SELECT "code" INTO assigned FROM "AnnexConsultationCode"
    WHERE "customerWorksiteId" = site_id AND "periodFrom" = start_day AND "periodTo" = end_day;
  IF FOUND THEN RETURN assigned; END IF;

  -- Only an unseen consultation takes the lock. Recheck after a concurrent reservation commits.
  PERFORM pg_advisory_xact_lock(hashtextextended('annex-consultation-code', 0));
  SELECT "code" INTO assigned FROM "AnnexConsultationCode"
    WHERE "customerWorksiteId" = site_id AND "periodFrom" = start_day AND "periodTo" = end_day;
  IF FOUND THEN RETURN assigned; END IF;

  SELECT "customerId" INTO STRICT client_id FROM "CustomerWorksite" WHERE id = site_id;
  SELECT "prefix" INTO client_prefix FROM "AnnexCustomerPrefix" WHERE "customerId" = client_id;
  IF NOT FOUND THEN
    SELECT candidate % 1000 INTO client_prefix FROM generate_series(1,1000) candidate
    WHERE NOT EXISTS (SELECT 1 FROM "AnnexCustomerPrefix" WHERE "prefix" = candidate % 1000)
    ORDER BY candidate LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Se agotaron los prefijos de tres dígitos para clientes de anexos'; END IF;
    INSERT INTO "AnnexCustomerPrefix" ("prefix", "customerId") VALUES (client_prefix, client_id);
  END IF;

  base := lpad(client_prefix::text, 3, '0') || to_char(start_day,'MM') || CASE
    WHEN extract(day FROM start_day) = 1 AND end_day = start_day + 14 THEN '1'
    WHEN extract(day FROM start_day) = 16 AND end_day = month_end THEN '2'
    WHEN extract(day FROM start_day) = 1 AND end_day = month_end THEN '3'
    ELSE '4' END;
  SELECT coalesce(max("ordinal"),0) + 1 INTO next_ordinal FROM "AnnexConsultationCode" WHERE "year" = extract(year FROM start_day)::integer AND "baseCode" = base;
  assigned := base || CASE WHEN next_ordinal = 1 THEN '' ELSE next_ordinal::text END;
  INSERT INTO "AnnexConsultationCode" ("year","code","customerWorksiteId","periodFrom","periodTo","through","baseCode","ordinal")
    VALUES (extract(year FROM start_day)::integer,assigned,site_id,start_day,end_day,data_day,base,next_ordinal);
  RETURN assigned;
END;
$$;

CREATE OR REPLACE FUNCTION assign_draft_annex_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."annexYear" := extract(year FROM NEW."periodFrom")::integer;
  NEW."annexCode" := reserve_annex_code(NEW."customerWorksiteId", NEW."periodFrom", NEW."periodTo", NEW."periodTo");
  RETURN NEW;
END;
$$;
COMMIT;
