ALTER TABLE `admin_dashboard_todos` ADD COLUMN `is_urgent` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `admin_dashboard_todos` ADD COLUMN `resolution_note` VARCHAR(2000) NULL;
