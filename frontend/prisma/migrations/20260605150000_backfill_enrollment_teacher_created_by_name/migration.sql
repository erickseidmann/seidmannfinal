-- Preencher autor de cadastro em registros antigos (antes do rastreio por admin)
UPDATE `enrollments` e
INNER JOIN `users` u ON u.id = e.created_by_id
SET e.created_by_name = u.nome
WHERE e.created_by_name IS NULL OR TRIM(e.created_by_name) = '';

UPDATE `teachers` t
INNER JOIN `users` u ON u.id = t.created_by_id
SET t.created_by_name = u.nome
WHERE t.created_by_name IS NULL OR TRIM(t.created_by_name) = '';

UPDATE `enrollments` e
INNER JOIN `users` u ON u.email = 'admin@seidmann.com'
SET e.created_by_name = u.nome
WHERE e.created_by_name IS NULL OR TRIM(e.created_by_name) = '';

UPDATE `teachers` t
INNER JOIN `users` u ON u.email = 'admin@seidmann.com'
SET t.created_by_name = u.nome
WHERE t.created_by_name IS NULL OR TRIM(t.created_by_name) = '';

UPDATE `enrollments` e
INNER JOIN (
  SELECT nome FROM `users` WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1
) admin_user ON 1 = 1
SET e.created_by_name = admin_user.nome
WHERE e.created_by_name IS NULL OR TRIM(e.created_by_name) = '';

UPDATE `teachers` t
INNER JOIN (
  SELECT nome FROM `users` WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1
) admin_user ON 1 = 1
SET t.created_by_name = admin_user.nome
WHERE t.created_by_name IS NULL OR TRIM(t.created_by_name) = '';
