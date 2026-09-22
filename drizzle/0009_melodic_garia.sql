ALTER TABLE `links` ADD `security_status` text DEFAULT 'unscanned' NOT NULL;--> statement-breakpoint
-- SQLiteのALTER TABLE ADD COLUMNはunixepoch()のような非定数のDEFAULT式を許可しないため、
-- 定数(0)を暫定defaultとして列を追加した後、UPDATEで既存行に実際の現在時刻を一括セットする。
-- (drizzle-kit generateがそのまま出力した `DEFAULT (unixepoch() * 1000)` は
-- `Cannot add a column with non-constant default: SQLITE_ERROR` で失敗するため手動修正)
ALTER TABLE `links` ADD `last_scanned_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `links` SET `last_scanned_at` = (unixepoch() * 1000);