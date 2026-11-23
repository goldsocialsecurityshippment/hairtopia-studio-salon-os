CREATE TABLE "payment_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"amount_type" text NOT NULL,
	"amount" real NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"payment_id" text,
	"submitted_by_user_id" text,
	"submitted_at" text,
	"reviewed_by_user_id" text,
	"reviewed_at" text,
	"review_note" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;