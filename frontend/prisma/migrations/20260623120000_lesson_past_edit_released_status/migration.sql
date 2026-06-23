-- AlterEnum: adiciona RELEASED (liberada para reagendamento por qualquer admin)
ALTER TABLE `lesson_past_edit_requests` MODIFY `status` ENUM('PENDING', 'RELEASED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';
