-- Mensagens de anúncio podem ser longas (ex.: bilíngue); VARCHAR(191) causava falha ao criar em produção.
ALTER TABLE `announcements` MODIFY `message` TEXT NOT NULL;
