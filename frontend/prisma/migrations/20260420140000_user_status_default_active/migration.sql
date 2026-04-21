-- Novos usuários passam a nascer ACTIVE para poder logar; controle de matrícula é no Enrollment, não em User PENDING.
ALTER TABLE `users` MODIFY `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE';
