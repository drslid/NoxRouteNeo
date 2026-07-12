DROP INDEX "devices_reality_short_id_uidx";--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "reality_short_id" text;