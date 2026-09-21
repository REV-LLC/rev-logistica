BEGIN;

CREATE TABLE "EmployeeLoanEntry" (
 "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL, "type" TEXT NOT NULL,
 "date" DATE, "detail" TEXT NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
 "requestId" TEXT NOT NULL, "createdById" TEXT,
 "sourceReference" TEXT, "sourceRow" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmployeeLoanEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EmployeeLoanEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EmployeeLoanEntry_provenance_check" CHECK (
   ("sourceReference" IS NULL AND "sourceRow" IS NULL AND "createdById" IS NOT NULL AND "date" IS NOT NULL)
   OR ("sourceReference" IS NOT NULL AND length(trim("sourceReference")) > 0 AND "sourceRow" IS NOT NULL AND "sourceRow" >= 0 AND "createdById" IS NULL)
 ),
 CONSTRAINT "EmployeeLoanEntry_opening_date_check" CHECK ("type" <> 'OPENING' OR "date" IS NOT NULL),
 CONSTRAINT "EmployeeLoanEntry_type_check" CHECK ("type" IN ('OPENING','CHARGE','PAYMENT')),
 CONSTRAINT "EmployeeLoanEntry_amount_check" CHECK ("amount" > 0 OR ("type" = 'OPENING' AND "amount" = 0))
);
CREATE UNIQUE INDEX "EmployeeLoanEntry_employeeId_requestId_key" ON "EmployeeLoanEntry"("employeeId", "requestId");
CREATE UNIQUE INDEX "EmployeeLoanEntry_one_opening" ON "EmployeeLoanEntry"("employeeId") WHERE "type" = 'OPENING';
CREATE INDEX "EmployeeLoanEntry_employeeId_date_createdAt_idx" ON "EmployeeLoanEntry"("employeeId", "date", "createdAt");

CREATE UNIQUE INDEX "EmployeeLoanEntry_sourceReference_sourceRow_key" ON "EmployeeLoanEntry"("sourceReference", "sourceRow");

-- Historical import from prestamos empleados.pdf, page 1 (nine cards).
-- NULL dates represent missing source dates, never inferred dates.
-- Row 0 is the opening; subsequent row numbers preserve source order and duplicates.
-- No historical movement is attributed to an application user.
CREATE TEMP TABLE loan_import_accounts (
  source_name TEXT PRIMARY KEY, employee_name TEXT NOT NULL, expected_balance NUMERIC(14,2) NOT NULL
) ON COMMIT DROP;
INSERT INTO loan_import_accounts VALUES
('HECTOR RAMIREZ', 'HECTOR RAMIREZ ESCOBAR', 7300000),
('MAURICIO GARCES', 'MAURICIO ANDRES GARCES RIASCO', 2298300),
('FERNANDO MARTINEZ', 'LUIS FERNANDO MARTINEZ OROZCO', 792000),
('WILLINTON SEGURA', 'WILLINTON SEGURA LANDAZURY', 2010000),
('ALEXANDER GUEVARA', 'JOHN ALEXANDER GUEVARA LOZANO', 310000),
('MARIO GOMEZ', 'MARIO ERNESTO GOMEZ ZAMBRANO', 5526400),
('ROBINSON SEGURA', 'ROBINSON ALEXIS SEGURA QUIÑONES', 1181500),
('CRISTIAN PARRA', 'EDGAR CRISTIAN PARRA PALACIO', 250000),
('PAOLA JOAQUI', 'PAOLA ANDREA JOAQUI ACEVEDO', 300000);

CREATE TEMP TABLE loan_import_rows (
  source_name TEXT NOT NULL REFERENCES loan_import_accounts(source_name),
  source_row INTEGER NOT NULL, entry_type TEXT NOT NULL, entry_date DATE, detail TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL, PRIMARY KEY (source_name, source_row)
) ON COMMIT DROP;
INSERT INTO loan_import_rows VALUES
('HECTOR RAMIREZ', 0, 'OPENING', '2025-03-30', 'Saldo inicial', 12800000),
('HECTOR RAMIREZ', 1, 'PAYMENT', '2025-03-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 2, 'PAYMENT', '2025-06-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 3, 'PAYMENT', '2025-05-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 4, 'PAYMENT', '2025-06-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 5, 'PAYMENT', '2025-07-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 6, 'PAYMENT', '2025-08-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 7, 'PAYMENT', '2025-10-03', 'NOMINA', 356000),
('HECTOR RAMIREZ', 8, 'PAYMENT', '2025-10-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 9, 'PAYMENT', '2025-11-30', 'NOMINA', 350000),
('HECTOR RAMIREZ', 10, 'PAYMENT', '2025-12-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 11, 'PAYMENT', '2026-02-28', 'NOMINA', 356000),
('HECTOR RAMIREZ', 12, 'CHARGE', '2026-03-20', 'NOMINA', 500000),
('HECTOR RAMIREZ', 13, 'PAYMENT', '2026-03-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 14, 'PAYMENT', '2026-04-30', 'NOMINA', 356000),
('HECTOR RAMIREZ', 15, 'CHARGE', '2026-05-13', 'NN', 100000),
('HECTOR RAMIREZ', 16, 'PAYMENT', '2026-05-15', 'NOMINA', 50000),
('HECTOR RAMIREZ', 17, 'PAYMENT', '2026-05-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 18, 'PAYMENT', '2026-06-30', 'NOMINA', 360000),
('HECTOR RAMIREZ', 19, 'PAYMENT', '2026-07-31', 'NOMINA', 356000),
('HECTOR RAMIREZ', 20, 'PAYMENT', '2026-08-31', 'NOMINA', 356000),
('MAURICIO GARCES', 0, 'OPENING', '2026-05-01', 'Saldo inicial', 1025000),
('MAURICIO GARCES', 1, 'PAYMENT', '2026-05-15', 'NOMINA', 50000),
('MAURICIO GARCES', 2, 'CHARGE', '2026-05-25', 'NN', 50000),
('MAURICIO GARCES', 3, 'PAYMENT', '2026-05-31', 'NOMINA', 50000),
('MAURICIO GARCES', 4, 'PAYMENT', '2026-06-15', 'NOMINA', 50000),
('MAURICIO GARCES', 5, 'CHARGE', '2026-06-22', 'TELEFONO', 470000),
('MAURICIO GARCES', 6, 'PAYMENT', '2026-06-30', 'NOMINA', 50000),
('MAURICIO GARCES', 7, 'CHARGE', '2026-07-16', 'AUDIFONOS', 110000),
('MAURICIO GARCES', 8, 'PAYMENT', '2026-07-31', 'NOMINA', 50000),
('MAURICIO GARCES', 9, 'CHARGE', '2026-08-02', 'MOTO', 550000),
('MAURICIO GARCES', 10, 'CHARGE', '2026-09-11', 'SOAT', 343300),
('FERNANDO MARTINEZ', 0, 'OPENING', '2025-10-15', 'Saldo inicial', 1430000),
('FERNANDO MARTINEZ', 1, 'CHARGE', '2025-10-25', 'NN', 200000),
('FERNANDO MARTINEZ', 2, 'PAYMENT', '2025-10-30', 'NOMINA', 100000),
('FERNANDO MARTINEZ', 3, 'PAYMENT', '2025-11-15', 'NOMINA', 100000),
('FERNANDO MARTINEZ', 4, 'PAYMENT', '2025-11-30', 'NOMINA', 176000),
('FERNANDO MARTINEZ', 5, 'PAYMENT', '2025-12-15', 'NOMINA', 98000),
('FERNANDO MARTINEZ', 6, 'PAYMENT', '2025-12-31', 'NOMINA', 42000),
('FERNANDO MARTINEZ', 7, 'PAYMENT', '2026-01-15', 'NOMINA', 44000),
('FERNANDO MARTINEZ', 8, 'PAYMENT', '2026-01-31', 'NOMINA', 70000),
('FERNANDO MARTINEZ', 9, 'PAYMENT', '2026-03-15', 'NOMINA', 50000),
('FERNANDO MARTINEZ', 10, 'PAYMENT', '2026-03-31', 'NOMINA', 60000),
('FERNANDO MARTINEZ', 11, 'PAYMENT', '2026-03-15', 'NOMINA', 30000),
('FERNANDO MARTINEZ', 12, 'CHARGE', '2026-04-15', 'TELEFONO', 500000),
('FERNANDO MARTINEZ', 13, 'PAYMENT', '2026-04-15', 'NOMINA', 30000),
('FERNANDO MARTINEZ', 14, 'PAYMENT', '2026-04-30', 'NOMINA', 90000),
('FERNANDO MARTINEZ', 15, 'PAYMENT', '2026-05-15', 'NOMINA', 84000),
('FERNANDO MARTINEZ', 16, 'PAYMENT', '2026-06-20', 'NOMINA', 208000),
('FERNANDO MARTINEZ', 17, 'CHARGE', '2026-06-25', 'AUDIFONOS', 110000),
('FERNANDO MARTINEZ', 18, 'PAYMENT', '2026-06-30', 'NOMINA', 50000),
('FERNANDO MARTINEZ', 19, 'PAYMENT', '2026-07-31', 'HORAS', 74500),
('FERNANDO MARTINEZ', 20, 'PAYMENT', '2026-08-15', 'HORAS', 41000),
('FERNANDO MARTINEZ', 21, 'PAYMENT', '2026-08-31', 'HORAS', 48000),
('FERNANDO MARTINEZ', 22, 'PAYMENT', '2026-09-15', 'HORAS', 52500),
('WILLINTON SEGURA', 0, 'OPENING', '2025-10-15', 'Saldo inicial', 2527000),
('WILLINTON SEGURA', 1, 'PAYMENT', '2026-01-15', 'NOMINA', 58348),
('WILLINTON SEGURA', 2, 'PAYMENT', '2026-01-31', 'NOMINA', 75000),
('WILLINTON SEGURA', 3, 'PAYMENT', '2026-03-15', 'NOMINA', 50000),
('WILLINTON SEGURA', 4, 'PAYMENT', '2026-03-31', 'NOMINA', 50000),
('WILLINTON SEGURA', 5, 'PAYMENT', '2026-04-15', 'NOMINA', 50000),
('WILLINTON SEGURA', 6, 'CHARGE', '2026-04-13', 'TECNO', 250000),
('WILLINTON SEGURA', 7, 'PAYMENT', '2026-04-30', 'NOMINA', 100000),
('WILLINTON SEGURA', 8, 'CHARGE', '2026-05-03', 'SOAT', 357000),
('WILLINTON SEGURA', 9, 'PAYMENT', '2026-05-15', 'NOMINA', 100652),
('WILLINTON SEGURA', 10, 'PAYMENT', '2026-05-31', 'NOMINA', 100000),
('WILLINTON SEGURA', 11, 'PAYMENT', '2026-06-19', 'NOMINA', 100000),
('WILLINTON SEGURA', 12, 'PAYMENT', '2026-06-20', 'NOMINA', 90000),
('WILLINTON SEGURA', 13, 'PAYMENT', '2026-06-30', 'NOMINA', 50000),
('WILLINTON SEGURA', 14, 'PAYMENT', '2026-07-15', 'HRS', 50000),
('WILLINTON SEGURA', 15, 'PAYMENT', '2026-07-31', 'NOMINA', 50000),
('WILLINTON SEGURA', 16, 'PAYMENT', '2026-08-15', 'HRS', 100000),
('WILLINTON SEGURA', 17, 'PAYMENT', '2026-08-31', 'HRS', 50000),
('WILLINTON SEGURA', 18, 'PAYMENT', '2026-09-15', 'HRS', 50000),
('ALEXANDER GUEVARA', 0, 'OPENING', '2026-03-14', 'Saldo inicial', 390000),
('ALEXANDER GUEVARA', 1, 'PAYMENT', '2026-03-14', 'NOMINA', 130000),
('ALEXANDER GUEVARA', 2, 'PAYMENT', '2026-04-15', 'NOMINA', 130000),
('ALEXANDER GUEVARA', 3, 'CHARGE', '2026-04-07', 'NN', 100000),
('ALEXANDER GUEVARA', 4, 'PAYMENT', '2026-05-15', 'NOMINA', 130000),
('ALEXANDER GUEVARA', 5, 'CHARGE', '2026-05-30', 'NN', 280000),
('ALEXANDER GUEVARA', 6, 'PAYMENT', '2026-06-19', 'NOMINA', 380000),
('ALEXANDER GUEVARA', 7, 'CHARGE', NULL, 'Sin concepto registrado', 200000),
('ALEXANDER GUEVARA', 8, 'CHARGE', '2026-07-16', 'AUDIFONOS', 110000),
('MARIO GOMEZ', 0, 'OPENING', '2026-01-31', 'Saldo inicial', 1873652),
('MARIO GOMEZ', 1, 'PAYMENT', '2026-01-31', 'NOMINA', 54000),
('MARIO GOMEZ', 2, 'CHARGE', '2026-03-04', 'LICENCIA', 200000),
('MARIO GOMEZ', 3, 'CHARGE', NULL, 'MOTO', 3750000),
('MARIO GOMEZ', 4, 'PAYMENT', '2026-03-15', 'NOMINA', 125000),
('MARIO GOMEZ', 5, 'PAYMENT', '2026-03-31', 'NOMINA', 125000),
('MARIO GOMEZ', 6, 'PAYMENT', '2026-04-15', 'NOMINA', 125000),
('MARIO GOMEZ', 7, 'PAYMENT', '2026-04-30', 'NOMINA', 125000),
('MARIO GOMEZ', 8, 'PAYMENT', '2026-04-15', 'NOMINA', 125000),
('MARIO GOMEZ', 9, 'PAYMENT', '2026-05-15', 'NOMINA', 125000),
('MARIO GOMEZ', 10, 'CHARGE', '2026-05-22', 'MOTO', 360000),
('MARIO GOMEZ', 11, 'PAYMENT', '2026-05-31', 'NOMINA', 125000),
('MARIO GOMEZ', 12, 'PAYMENT', '2026-05-31', 'NOMINA', 52652),
('MARIO GOMEZ', 13, 'CHARGE', '2026-05-31', 'SAMUEL', 60000),
('MARIO GOMEZ', 14, 'PAYMENT', '2026-06-19', 'PRIMA', 200000),
('MARIO GOMEZ', 15, 'PAYMENT', '2026-06-20', 'NOMINA', 100000),
('MARIO GOMEZ', 16, 'PAYMENT', '2026-06-30', 'NOMINA', 125000),
('MARIO GOMEZ', 17, 'PAYMENT', '2026-07-15', 'HRS', 125000),
('MARIO GOMEZ', 18, 'PAYMENT', '2026-07-31', 'NOMINA', 125000),
('MARIO GOMEZ', 19, 'PAYMENT', '2026-07-15', 'NOMINA', 150000),
('MARIO GOMEZ', 20, 'CHARGE', '2026-08-15', 'LICENCIA', 427400),
('MARIO GOMEZ', 21, 'CHARGE', '2026-08-12', 'SOAT/TEC', 605000),
('MARIO GOMEZ', 22, 'PAYMENT', '2026-08-15', 'HRS', 43000),
('MARIO GOMEZ', 23, 'CHARGE', '2026-09-11', 'MOTO', 100000),
('ROBINSON SEGURA', 0, 'OPENING', '2026-01-15', 'Saldo inicial', 938000),
('ROBINSON SEGURA', 1, 'PAYMENT', '2026-01-15', 'NOMINA', 42500),
('ROBINSON SEGURA', 2, 'PAYMENT', '2026-01-31', 'NOMINA', 50000),
('ROBINSON SEGURA', 3, 'PAYMENT', '2026-03-15', 'NOMINA', 50000),
('ROBINSON SEGURA', 4, 'PAYMENT', '2026-03-30', 'NOMINA', 50000),
('ROBINSON SEGURA', 5, 'PAYMENT', '2026-04-30', 'NOMINA', 50000),
('ROBINSON SEGURA', 6, 'CHARGE', '2026-04-30', 'TELEFONO', 500000),
('ROBINSON SEGURA', 7, 'PAYMENT', '2026-05-31', 'NOMINA', 100500),
('ROBINSON SEGURA', 8, 'CHARGE', '2026-06-16', 'AUDIFONOS', 110000),
('ROBINSON SEGURA', 9, 'PAYMENT', '2026-06-19', 'NOMINA', 100000),
('ROBINSON SEGURA', 10, 'PAYMENT', '2026-06-20', 'NOMINA', 50000),
('ROBINSON SEGURA', 11, 'PAYMENT', '2026-06-30', 'HORAS', 50000),
('ROBINSON SEGURA', 12, 'PAYMENT', '2026-07-15', 'HORAS', 50000),
('ROBINSON SEGURA', 13, 'CHARGE', '2026-07-31', 'PRESTAMO', 500000),
('ROBINSON SEGURA', 14, 'PAYMENT', '2026-07-31', 'HORAS', 108500),
('ROBINSON SEGURA', 15, 'PAYMENT', '2026-08-15', 'NOMINA', 50000),
('ROBINSON SEGURA', 16, 'PAYMENT', '2026-08-15', 'HRS', 50000),
('ROBINSON SEGURA', 17, 'PAYMENT', '2026-08-31', 'HRS', 65000),
('CRISTIAN PARRA', 0, 'OPENING', '2026-09-04', 'Saldo inicial', 350000),
('CRISTIAN PARRA', 1, 'PAYMENT', '2026-09-04', 'HRS', 50000),
('CRISTIAN PARRA', 2, 'PAYMENT', '2026-09-15', 'HRS', 50000),
('PAOLA JOAQUI', 0, 'OPENING', '2026-09-04', 'Saldo inicial', 300000);

-- Full names were verified against the existing employee directory.
-- Normalize accents/case/spacing, but do not guess from partial names or create employees.
LOCK TABLE "Employee" IN SHARE MODE;
CREATE TEMP TABLE loan_import_matches ON COMMIT DROP AS
SELECT a.source_name, e.id AS employee_id
FROM loan_import_accounts a
JOIN "Employee" e ON
  translate(upper(regexp_replace(trim(e.name || ' ' || e."lastName"), '\s+', ' ', 'g')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') =
  translate(upper(a.employee_name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN');

DO $$
DECLARE invalid_names TEXT;
BEGIN
  SELECT string_agg(a.source_name, ', ' ORDER BY a.source_name) INTO invalid_names
  FROM loan_import_accounts a
  WHERE (SELECT count(*) FROM loan_import_matches m WHERE m.source_name = a.source_name) <> 1;
  IF invalid_names IS NOT NULL THEN
    RAISE EXCEPTION 'Loan import requires exactly one existing employee per card. Missing or ambiguous: %', invalid_names;
  END IF;
  IF (SELECT count(DISTINCT employee_id) FROM loan_import_matches) <> 9 THEN
    RAISE EXCEPTION 'Loan import cannot assign two cards to the same employee';
  END IF;
  IF EXISTS (
    SELECT 1 FROM loan_import_accounts a JOIN loan_import_rows r USING (source_name)
    GROUP BY a.source_name, a.expected_balance
    HAVING sum(CASE WHEN r.entry_type = 'PAYMENT' THEN -r.amount ELSE r.amount END) <> a.expected_balance
  ) THEN
    RAISE EXCEPTION 'Loan source rows do not reconcile with the PDF balances';
  END IF;
END $$;

INSERT INTO "EmployeeLoanEntry"
  (id, "employeeId", type, date, detail, amount, "requestId", "createdById", "sourceReference", "sourceRow")
SELECT
  'loan-pdf-' || md5(r.source_name || ':' || r.source_row),
  m.employee_id, r.entry_type, r.entry_date, r.detail, r.amount,
  'prestamos-empleados-pdf:' || r.source_name || ':' || r.source_row,
  NULL, 'prestamos empleados.pdf / pagina 1 / ' || r.source_name, r.source_row
FROM loan_import_rows r JOIN loan_import_matches m USING (source_name);

DO $$
BEGIN
  IF (SELECT count(*) FROM "EmployeeLoanEntry") <> 129 THEN
    RAISE EXCEPTION 'Loan import row count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM loan_import_accounts a
    JOIN loan_import_matches m USING (source_name)
    JOIN "EmployeeLoanEntry" e ON e."employeeId" = m.employee_id
    GROUP BY a.source_name, a.expected_balance
    HAVING sum(CASE WHEN e.type = 'PAYMENT' THEN -e.amount ELSE e.amount END) <> a.expected_balance
  ) THEN
    RAISE EXCEPTION 'Imported loan balances do not reconcile with the PDF';
  END IF;
END $$;
COMMIT;
