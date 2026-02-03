-- AlterTable: professor enviou nota fiscal/recibo para financeiro
ALTER TABLE `teacher_payment_months` ADD COLUMN `proof_sent_at` DATETIME(3) NULL;
