-- STAGING ONLY. This script must never run against production.
BEGIN;
DO $$ BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system()) <> '7675788035559903287' THEN
    RAISE EXCEPTION 'Expected the verified REV staging PostgreSQL instance';
  END IF;
END $$;
ALTER TABLE attendance_test."AttendancePunch"
  ADD COLUMN IF NOT EXISTS "detectionScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "detectionThreshold" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "detectionReprocessedAt" TIMESTAMP(3);
COMMIT;
