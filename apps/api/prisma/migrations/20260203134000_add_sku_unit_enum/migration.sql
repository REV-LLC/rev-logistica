-- CreateEnum
CREATE TYPE "SkuUnit" AS ENUM ('UNIT', 'KG', 'TON', 'M', 'M2', 'INCH', 'CM', 'HOUR', 'KM', 'SMALL', 'MEDIUM', 'LARGE');

-- Alter column type with safe mapping (default to UNIT)
ALTER TABLE "Sku"
  ALTER COLUMN "unit" TYPE "SkuUnit"
  USING (
    CASE
      WHEN LOWER("unit") = 'unit' THEN 'UNIT'
      WHEN LOWER("unit") = 'kg' THEN 'KG'
      WHEN LOWER("unit") IN ('t', 'ton', 'tons', 'tonelada', 'toneladas') THEN 'TON'
      WHEN LOWER("unit") IN ('m', 'ml', 'metro', 'metros', 'meter', 'meters', 'metros lineales') THEN 'M'
      WHEN LOWER("unit") IN ('m2', 'mt2', 'm^2', 'metro cuadrado', 'metros cuadrados') THEN 'M2'
      WHEN LOWER("unit") IN ('in', 'inch', 'inches', 'pulgada', 'pulgadas') THEN 'INCH'
      WHEN LOWER("unit") IN ('cm', 'centimetro', 'centimetros', 'centimeter', 'centimeters') THEN 'CM'
      WHEN LOWER("unit") IN ('h', 'hr', 'hour', 'hora', 'horas') THEN 'HOUR'
      WHEN LOWER("unit") IN ('km', 'kilometro', 'kilometros', 'kilometer', 'kilometers') THEN 'KM'
      WHEN LOWER("unit") IN ('pequeno', 'pequena', 'small') THEN 'SMALL'
      WHEN LOWER("unit") IN ('mediano', 'mediana', 'medium') THEN 'MEDIUM'
      WHEN LOWER("unit") IN ('grande', 'large') THEN 'LARGE'
      ELSE 'UNIT'
    END
  )::"SkuUnit";
