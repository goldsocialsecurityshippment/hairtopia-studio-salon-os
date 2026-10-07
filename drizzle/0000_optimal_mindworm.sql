CREATE TABLE "appointment_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"status" text NOT NULL,
	"changed_by_user_id" text,
	"changed_by_role" text,
	"note" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"service_id" text NOT NULL,
	"variation_id" text,
	"stylist_id" text,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"price_estimate" real NOT NULL,
	"instructions" text,
	"source" text DEFAULT 'online' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"customer_arrived_at" text,
	"arrival_location_verified" boolean,
	"service_started_at" text,
	"service_completed_at" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"client_id" text,
	"deposit_required" real DEFAULT 0 NOT NULL,
	"deposit_paid" real DEFAULT 0 NOT NULL,
	"balance_due" real DEFAULT 0 NOT NULL,
	"cancellation_request_status" text DEFAULT 'none' NOT NULL,
	"accepted_terms_id" text,
	"accepted_terms_version" integer,
	"accepted_terms_at" text
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"date" text NOT NULL,
	"scheduled_start" text,
	"login_at" text,
	"check_in_at" text,
	"check_in_verified" boolean,
	"check_out_at" text,
	"check_out_verified" boolean,
	"status" text DEFAULT 'not_checked_in' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" text PRIMARY KEY NOT NULL,
	"attendance_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"location_lat" real,
	"location_lng" real,
	"verified" boolean,
	"corrected_by_user_id" text,
	"original_value" text,
	"new_value" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_value" text,
	"after_value" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" text PRIMARY KEY NOT NULL,
	"stylist_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellations" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"cancelled_by_user_id" text,
	"cancelled_by_role" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"appointment_id" text,
	"visit_id" text,
	"url" text NOT NULL,
	"photo_type" text NOT NULL,
	"visibility" text DEFAULT 'private_staff' NOT NULL,
	"public_approved" boolean DEFAULT false NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"appointment_id" text,
	"visit_date" text NOT NULL,
	"service_id" text,
	"stylist_id" text,
	"hair_condition_observed" text,
	"products_used" text,
	"outcome" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"linked_user_id" text,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp" text,
	"email" text,
	"preferred_contact" text DEFAULT 'phone' NOT NULL,
	"hair_type" text,
	"hair_length" text,
	"hair_density" text,
	"hair_condition" text,
	"scalp_condition" text,
	"scalp_concerns" text,
	"chemical_history" text,
	"colour_history" text,
	"bleach_history" text,
	"hair_status" text DEFAULT 'unspecified' NOT NULL,
	"protective_style_history" text,
	"preferred_products" text,
	"allergies" text,
	"sensitivities" text,
	"previous_reactions" text,
	"special_requests" text,
	"notes" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text,
	CONSTRAINT "clients_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "completed_work" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"photo_url" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"review_status" text DEFAULT 'pending_review' NOT NULL,
	"reviewed_by_user_id" text,
	"review_note" text,
	"reviewed_at" text
);
--> statement-breakpoint
CREATE TABLE "consultation_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"category" text NOT NULL,
	"requested_stylist_id" text,
	"requested_category" text,
	"preferred_date" text,
	"preferred_time" text,
	"hair_info_snapshot" text,
	"concerns" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"reviewed_by_user_id" text,
	"staff_recommendation" text,
	"suggested_service_id" text,
	"suggested_price" real,
	"suggested_duration_minutes" integer,
	"converted_appointment_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preferred_stylist_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "customer_references" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"url" text NOT NULL,
	"type" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_images" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"media_url" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"sku" text,
	"description" text,
	"photo_url" text,
	"supplier" text,
	"cost" real,
	"selling_price" real,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_threshold" integer DEFAULT 5 NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"location" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_change" integer NOT NULL,
	"previous_quantity" integer NOT NULL,
	"new_quantity" integer NOT NULL,
	"reason" text,
	"recorded_by_user_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"booking_events" boolean DEFAULT true NOT NULL,
	"reminder_events" boolean DEFAULT true NOT NULL,
	"payment_events" boolean DEFAULT true NOT NULL,
	"consultation_events" boolean DEFAULT true NOT NULL,
	"cancellation_events" boolean DEFAULT true NOT NULL,
	"staff_events" boolean DEFAULT true NOT NULL,
	"queue_events" boolean DEFAULT true NOT NULL,
	"system_events" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"related_appointment_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"amount" real NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"recorded_by_user_id" text,
	"note" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"payment_type" text DEFAULT 'full' NOT NULL,
	"transaction_reference" text,
	"external_id" text,
	"provider_transaction_id" text,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"refunded_amount" real DEFAULT 0 NOT NULL,
	"provider_response_metadata" text,
	CONSTRAINT "payments_transaction_reference_unique" UNIQUE("transaction_reference")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_active_at" text,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "queue_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reschedule_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"requested_date" text NOT NULL,
	"requested_time" text NOT NULL,
	"requested_stylist_id" text,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" text,
	"requested_by_role" text,
	"resolved_by_user_id" text,
	"resolved_at" text,
	"previous_date" text NOT NULL,
	"previous_time" text NOT NULL,
	"previous_stylist_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"customer_id" text,
	"overall_rating" integer NOT NULL,
	"quality_rating" integer,
	"professionalism_rating" integer,
	"communication_rating" integer,
	"respectfulness_rating" integer,
	"punctuality_rating" integer,
	"comment" text,
	"moderated" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salon_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"name" text DEFAULT 'Hairtopia Studio' NOT NULL,
	"logo_url" text,
	"address" text DEFAULT '266 Afro Osro Street' NOT NULL,
	"map_url" text,
	"latitude" real,
	"longitude" real,
	"phone" text,
	"email" text DEFAULT 'nikinuel@gmail.com',
	"instagram" text DEFAULT '@Hairtopia_Studio',
	"facebook" text DEFAULT 'Hairtopia',
	"open_time" text DEFAULT '08:30' NOT NULL,
	"close_time" text DEFAULT '19:30' NOT NULL,
	"check_in_radius_meters" integer DEFAULT 100 NOT NULL,
	"attendance_grace_period_minutes" integer DEFAULT 10 NOT NULL,
	"cancellation_policy" text DEFAULT 'Please cancel at least 2 hours before your appointment where possible.' NOT NULL,
	"no_show_grace_minutes" integer DEFAULT 20 NOT NULL,
	"deposit_enabled" boolean DEFAULT true NOT NULL,
	"deposit_percent" integer DEFAULT 20 NOT NULL,
	"deposit_flat_amount" real DEFAULT 100 NOT NULL,
	"deposit_mode" text DEFAULT 'flat' NOT NULL,
	"booking_buffer_minutes" integer DEFAULT 15 NOT NULL,
	"cancellation_window_hours" integer DEFAULT 24 NOT NULL,
	"overbooking_allowed" boolean DEFAULT false NOT NULL,
	"overtime_allowed_minutes" integer DEFAULT 0 NOT NULL,
	"low_stock_default_threshold" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT 'Terms & Conditions' NOT NULL,
	"content" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_variations" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"label" text NOT NULL,
	"price" real NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_min" real NOT NULL,
	"price_max" real,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"buffer_minutes" integer DEFAULT 15 NOT NULL,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_advances" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"amount" real NOT NULL,
	"reason" text,
	"balance_after" real NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"title" text NOT NULL,
	"contract_type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"terms" text,
	"status" text DEFAULT 'active' NOT NULL,
	"document_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"acknowledged_at" text,
	"created_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_no_shows" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"scheduled_date" text NOT NULL,
	"scheduled_start" text,
	"reason" text,
	"status" text DEFAULT 'under_review' NOT NULL,
	"recorded_by_user_id" text,
	"notes" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bio" text,
	"specialties" text,
	"photo_url" text,
	"years_experience" integer,
	"hire_date" text,
	"scheduled_start" text DEFAULT '08:30',
	"active" boolean DEFAULT true NOT NULL,
	"category" text DEFAULT 'hair_stylist' NOT NULL,
	"publicly_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_rule_acknowledgements" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" integer NOT NULL,
	"staff_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requires_acknowledgement" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_warnings" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"level" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"issued_by_user_id" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"acknowledged_at" text,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "stylist_services" (
	"id" text PRIMARY KEY NOT NULL,
	"stylist_id" text NOT NULL,
	"service_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uniform_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"item" text NOT NULL,
	"size" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"issue_date" text NOT NULL,
	"return_date" text,
	"condition" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"notes" text,
	"recorded_by_user_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_variation_id_service_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."service_variations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_stylist_id_users_id_fk" FOREIGN KEY ("stylist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_stylist_id_users_id_fk" FOREIGN KEY ("stylist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_visit_id_client_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."client_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_stylist_id_users_id_fk" FOREIGN KEY ("stylist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_work" ADD CONSTRAINT "completed_work_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_photos" ADD CONSTRAINT "consultation_photos_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_requested_stylist_id_users_id_fk" FOREIGN KEY ("requested_stylist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_suggested_service_id_services_id_fk" FOREIGN KEY ("suggested_service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_converted_appointment_id_appointments_id_fk" FOREIGN KEY ("converted_appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_references" ADD CONSTRAINT "customer_references_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedule_requests" ADD CONSTRAINT "reschedule_requests_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_terms" ADD CONSTRAINT "service_terms_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_variations" ADD CONSTRAINT "service_variations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_contracts" ADD CONSTRAINT "staff_contracts_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_no_shows" ADD CONSTRAINT "staff_no_shows_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_rule_acknowledgements" ADD CONSTRAINT "staff_rule_acknowledgements_rule_id_staff_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."staff_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_rule_acknowledgements" ADD CONSTRAINT "staff_rule_acknowledgements_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_warnings" ADD CONSTRAINT "staff_warnings_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stylist_services" ADD CONSTRAINT "stylist_services_stylist_id_users_id_fk" FOREIGN KEY ("stylist_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stylist_services" ADD CONSTRAINT "stylist_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uniform_issues" ADD CONSTRAINT "uniform_issues_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;