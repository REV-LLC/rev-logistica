-- Motor identity stays on Asset.assignedMotorId. Archive the draft configurator's
-- selectable motor rows before retiring them; never rewrite documents or stock.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "EquipmentConfigurationEntry" e
    JOIN "Asset" motor ON motor.id = e."assetId" AND motor.kind = 'MOTOR'
    JOIN "EquipmentConfiguration" c ON c.id = e."configurationId"
    LEFT JOIN "Asset" parent ON parent.id = c."assetId"
    WHERE parent.id IS NULL OR parent."assignedMotorId" IS DISTINCT FROM motor.id
  ) THEN
    RAISE EXCEPTION 'A configured motor has no matching persistent assignment. Reconcile it before cutover; no automatic reassignment.';
  END IF;
END $$;

INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
SELECT 'motor-entry:' || e.id, 'PersistentMotorCutover',
  jsonb_build_object('entry', to_jsonb(e), 'equipmentId', c."assetId", 'assignedMotorId', parent."assignedMotorId")
FROM "EquipmentConfigurationEntry" e
JOIN "EquipmentConfiguration" c ON c.id = e."configurationId"
LEFT JOIN "Asset" parent ON parent.id = c."assetId"
LEFT JOIN "Asset" motor ON motor.id = e."assetId"
LEFT JOIN "AssetFamily" family ON family.id = e."familyId"
WHERE motor.kind = 'MOTOR' OR family.code IN ('MOTORES', 'MOTOR_PARA_MEZCLADORA')
ON CONFLICT (id) DO NOTHING;

WITH retired AS (
  DELETE FROM "EquipmentConfigurationEntry" e
  USING "EquipmentConfigurationArchive" a
  WHERE a.id = 'motor-entry:' || e.id AND a.source = 'PersistentMotorCutover'
  RETURNING e."configurationId"
)
UPDATE "EquipmentConfiguration" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE id IN (SELECT "configurationId" FROM retired);
