CREATE TYPE "TaskReminderUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS');

ALTER TABLE "Task"
ADD COLUMN "reminderIntervalValue" INTEGER,
ADD COLUMN "reminderIntervalUnit" "TaskReminderUnit";

ALTER TABLE "Task"
ADD CONSTRAINT "Task_reminder_interval_pair_check"
CHECK (
    ("reminderIntervalValue" IS NULL AND "reminderIntervalUnit" IS NULL)
    OR
    ("reminderIntervalValue" >= 1 AND "reminderIntervalUnit" IS NOT NULL)
);
