CREATE TABLE "appointment_services" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"service_id" text NOT NULL,
	"variation_id" text,
	"price" real NOT NULL,
	"duration_minutes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accepted_terms_id" text,
	"accepted_terms_version" integer,
	"accepted_terms_at" text
);
--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_variation_id_service_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."service_variations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_services_appointment_order_unique" ON "appointment_services" USING btree ("appointment_id","sort_order");
--> statement-breakpoint
INSERT INTO "appointment_services" (
	"id",
	"appointment_id",
	"service_id",
	"variation_id",
	"price",
	"duration_minutes",
	"sort_order",
	"accepted_terms_id",
	"accepted_terms_version",
	"accepted_terms_at"
)
SELECT
	'legacy:' || appointment."id",
	appointment."id",
	appointment."service_id",
	appointment."variation_id",
	appointment."price_estimate",
	appointment."duration_minutes",
	0,
	appointment."accepted_terms_id",
	appointment."accepted_terms_version",
	appointment."accepted_terms_at"
FROM "appointments" AS appointment
WHERE NOT EXISTS (
	SELECT 1
	FROM "appointment_services" AS line
	WHERE line."appointment_id" = appointment."id"
);
