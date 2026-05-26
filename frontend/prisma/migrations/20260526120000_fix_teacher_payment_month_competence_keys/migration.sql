-- Corrige year/month em teacher_payment_months para refletir competência BRT
-- (mês/ano do último instante inclusivo antes de periodo_termino exclusivo).
--
-- Esta migration cobre os casos SIMPLES (UPDATE sem conflito de chave única
-- teacher_id+year+month).
--
-- Em produção, casos complexos (cadeias bloqueadas, registros phantom sem
-- período) foram tratados manualmente em 2026-05-26 via stored procedure
-- iterativa documentada em docs/auditoria-teacher-payment-month-year.md.
--
-- Implementação:
-- - Não usa DELIMITER (incompatível com Prisma migrate engine).
-- - Usa duas tabelas temporárias para evitar erro MySQL 1093
--   (UPDATE referenciando a mesma tabela em subquery).
-- - COLLATE utf8mb4_unicode_ci alinhado à tabela alvo.
-- - Idempotente: em bancos já corrigidos, executa 0 UPDATEs.

DROP TEMPORARY TABLE IF EXISTS _tpm_calc;
CREATE TEMPORARY TABLE _tpm_calc (
  id            VARCHAR(191) COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  teacher_id    VARCHAR(191) COLLATE utf8mb4_unicode_ci,
  correct_year  INT,
  correct_month INT,
  INDEX (teacher_id, correct_year, correct_month)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _tpm_calc (id, teacher_id, correct_year, correct_month)
SELECT
  id,
  teacher_id,
  YEAR (CONVERT_TZ(periodo_termino - INTERVAL 1 MICROSECOND, '+00:00', '-03:00')),
  MONTH(CONVERT_TZ(periodo_termino - INTERVAL 1 MICROSECOND, '+00:00', '-03:00'))
FROM teacher_payment_months
WHERE periodo_termino IS NOT NULL;

DROP TEMPORARY TABLE IF EXISTS _tpm_occupied;
CREATE TEMPORARY TABLE _tpm_occupied (
  teacher_id VARCHAR(191) COLLATE utf8mb4_unicode_ci,
  year       INT,
  month      INT,
  id         VARCHAR(191) COLLATE utf8mb4_unicode_ci,
  INDEX (teacher_id, year, month)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _tpm_occupied (teacher_id, year, month, id)
SELECT teacher_id, year, month, id FROM teacher_payment_months;

UPDATE teacher_payment_months AS tpm
INNER JOIN _tpm_calc AS calc ON calc.id = tpm.id
SET
  tpm.year       = calc.correct_year,
  tpm.month      = calc.correct_month,
  tpm.updated_at = NOW(3)
WHERE
  (tpm.year <> calc.correct_year OR tpm.month <> calc.correct_month)
  AND NOT EXISTS (
    SELECT 1 FROM _tpm_occupied o
    WHERE o.teacher_id = tpm.teacher_id
      AND o.year  = calc.correct_year
      AND o.month = calc.correct_month
      AND o.id   <> tpm.id
  );

DROP TEMPORARY TABLE IF EXISTS _tpm_calc;
DROP TEMPORARY TABLE IF EXISTS _tpm_occupied;
