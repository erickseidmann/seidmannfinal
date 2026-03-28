-- Data em que o pagamento do mês foi marcado como PAGO (exibe no painel do professor).
ALTER TABLE `teacher_payment_months` ADD COLUMN `payment_marked_paid_at` DATETIME(3) NULL;
