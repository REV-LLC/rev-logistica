INSERT INTO "AppSetting" ("key", "value", "category", "description", "updatedAt") VALUES
('branding.service_name', '"finge"'::jsonb, 'BRANDING', 'Nombre del servicio mostrado en la navegación', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
