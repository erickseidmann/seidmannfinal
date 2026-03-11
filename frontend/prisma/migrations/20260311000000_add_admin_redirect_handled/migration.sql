-- Create table to registrar alunos já tratados em "Alunos para redirecionar"
CREATE TABLE `admin_redirect_handled` (
  `id` varchar(191) NOT NULL,
  `enrollment_id` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `admin_redirect_handled_enrollment_id_idx` (`enrollment_id`),
  CONSTRAINT `admin_redirect_handled_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

