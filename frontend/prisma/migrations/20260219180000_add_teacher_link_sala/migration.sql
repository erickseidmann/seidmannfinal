-- AlterTable: teachers - link opcional para sala de videoconferência (Google Meet, Zoom, Teams)
ALTER TABLE `teachers` ADD COLUMN `link_sala` TEXT NULL;
