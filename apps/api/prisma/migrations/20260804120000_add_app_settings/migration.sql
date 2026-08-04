CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AppSettingAudit" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSettingAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");
CREATE INDEX "AppSettingAudit_settingKey_createdAt_idx" ON "AppSettingAudit"("settingKey", "createdAt" DESC);
CREATE INDEX "AppSettingAudit_updatedByUserId_idx" ON "AppSettingAudit"("updatedByUserId");

ALTER TABLE "AppSettingAudit" ADD CONSTRAINT "AppSettingAudit_settingKey_fkey"
FOREIGN KEY ("settingKey") REFERENCES "AppSetting"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppSettingAudit" ADD CONSTRAINT "AppSettingAudit_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AppSetting" ("key", "value", "category", "description", "updatedAt") VALUES
('tasks.notify_on_assignment', 'true'::jsonb, 'TASKS', 'Enviar WhatsApp al asignar o reasignar una tarea', CURRENT_TIMESTAMP),
('tasks.due_warning_hours', '24'::jsonb, 'TASKS', 'Horas de anticipación para avisar el vencimiento de una tarea', CURRENT_TIMESTAMP),
('tasks.overdue_repeat_enabled', 'true'::jsonb, 'TASKS', 'Repetir recordatorios de tareas vencidas', CURRENT_TIMESTAMP),
('tasks.overdue_repeat_interval_hours', '24'::jsonb, 'TASKS', 'Intervalo en horas entre recordatorios de tareas vencidas', CURRENT_TIMESTAMP),
('tasks.notify_on_due_date_change', 'true'::jsonb, 'TASKS', 'Avisar cuando cambia la fecha de vencimiento', CURRENT_TIMESTAMP);

-- Make existing assigned, unfinished tasks eligible for due-date reminders without
-- sending a retroactive "new assignment" message during deployment.
INSERT INTO "NotificationTopic" (
    "id", "entityType", "entityId", "eventType", "active", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, 'TASK', task."id", 'TASK_DUE', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Task" task
LEFT JOIN "Employee" employee ON employee."id" = task."assignedToEmployeeId"
JOIN "User" assignee ON assignee."id" = COALESCE(task."assignedToUserId", employee."userId")
WHERE task."status" <> 'DONE' AND assignee."active" = TRUE
ON CONFLICT ("entityType", "entityId", "eventType") DO UPDATE SET "active" = EXCLUDED."active";

INSERT INTO "NotificationRecipient" (
    "id", "topicId", "userId", "emailEnabled", "smsEnabled", "whatsappEnabled"
)
SELECT
    gen_random_uuid()::text, topic."id", assignee."id", FALSE, FALSE, TRUE
FROM "Task" task
LEFT JOIN "Employee" employee ON employee."id" = task."assignedToEmployeeId"
JOIN "User" assignee ON assignee."id" = COALESCE(task."assignedToUserId", employee."userId")
JOIN "NotificationTopic" topic
  ON topic."entityType" = 'TASK' AND topic."entityId" = task."id" AND topic."eventType" = 'TASK_DUE'
WHERE task."status" <> 'DONE' AND assignee."active" = TRUE
ON CONFLICT ("topicId", "userId") DO UPDATE SET "whatsappEnabled" = TRUE;
