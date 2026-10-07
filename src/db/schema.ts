import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(sql`(current_timestamp)`);

/** ---------- USERS & ROLES ----------
 * V2 adds "admin" (Trusted Admin — full client access like owner, but not
 * necessarily full financial/settings control). Existing rows are unaffected;
 * this is an additive enum change only. */
export const users = sqliteTable("users", {
  id: id(),
  role: text("role", { enum: ["customer", "stylist", "manager", "owner", "admin"] }).notNull(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  // --- V2: push notification preference (global on/off; not per-event) ---
  pushEnabled: integer("push_enabled", { mode: "boolean" }).notNull().default(true),
});

export const staffProfiles = sqliteTable("staff_profiles", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  bio: text("bio"),
  specialties: text("specialties"), // comma separated
  photoUrl: text("photo_url"),
  yearsExperience: integer("years_experience"),
  hireDate: text("hire_date"),
  scheduledStart: text("scheduled_start").default("08:30"), // default shift start HH:mm
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // --- V2: public team showcase ---
  category: text("category", {
    enum: ["hair_stylist", "nail_technician", "lash_technician", "makeup_artist", "other"],
  })
    .notNull()
    .default("hair_stylist"),
  publiclyVisible: integer("publicly_visible", { mode: "boolean" }).notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
});

export const customerProfiles = sqliteTable("customer_profiles", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  preferredStylistId: text("preferred_stylist_id"),
  notes: text("notes"),
});

/** ---------- SERVICE CATALOGUE ---------- */
export const serviceCategories = sqliteTable("service_categories", {
  id: id(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const services = sqliteTable("services", {
  id: id(),
  categoryId: text("category_id").notNull().references(() => serviceCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  priceMin: real("price_min").notNull(),
  priceMax: real("price_max"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  bufferMinutes: integer("buffer_minutes").notNull().default(15),
  imageUrl: text("image_url"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// A purchasable variation of a service (e.g. "Medium / 6 rows / Bottom Layer") with its own price.
// This is how size/rows/length combinations from the price list are represented without
// hard-coding pricing logic in application code — admins can add/edit/remove these freely.
export const serviceVariations = sqliteTable("service_variations", {
  id: id(),
  serviceId: text("service_id").notNull().references(() => services.id),
  label: text("label").notNull(), // e.g. "Medium / 6 rows / BL"
  price: real("price").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const stylistServices = sqliteTable("stylist_services", {
  id: id(),
  stylistId: text("stylist_id").notNull().references(() => users.id),
  serviceId: text("service_id").notNull().references(() => services.id),
});

// Weekly recurring working hours per stylist
export const availability = sqliteTable("availability", {
  id: id(),
  stylistId: text("stylist_id").notNull().references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat
  startTime: text("start_time").notNull(), // HH:mm
  endTime: text("end_time").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** ---------- APPOINTMENTS ---------- */
export const appointments = sqliteTable("appointments", {
  id: id(),
  customerId: text("customer_id").references(() => users.id), // null for guest walk-in
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  serviceId: text("service_id").notNull().references(() => services.id),
  variationId: text("variation_id").references(() => serviceVariations.id),
  stylistId: text("stylist_id").references(() => users.id),
  scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
  scheduledTime: text("scheduled_time").notNull(), // HH:mm
  durationMinutes: integer("duration_minutes").notNull(),
  priceEstimate: real("price_estimate").notNull(),
  instructions: text("instructions"),
  source: text("source", { enum: ["online", "walk_in", "qr", "consultation"] }).notNull().default("online"),
  status: text("status", {
    enum: [
      "pending", "confirmed", "arrived", "in_service",
      "completed", "cancelled", "no_show",
    ],
  }).notNull().default("pending"),
  customerArrivedAt: text("customer_arrived_at"),
  arrivalLocationVerified: integer("arrival_location_verified", { mode: "boolean" }),
  serviceStartedAt: text("service_started_at"),
  serviceCompletedAt: text("service_completed_at"),
  paymentStatus: text("payment_status", {
    enum: ["pending", "partial", "paid", "refunded", "disputed"],
  }).notNull().default("pending"),
  createdAt: createdAt(),
  // --- V2: CRM + deposits ---
  clientId: text("client_id").references(() => clients.id),
  depositRequired: real("deposit_required").notNull().default(0),
  depositPaid: real("deposit_paid").notNull().default(0),
  balanceDue: real("balance_due").notNull().default(0),
  cancellationRequestStatus: text("cancellation_request_status", {
    enum: ["none", "requested", "approved", "declined"],
  })
    .notNull()
    .default("none"),
  // --- V2: reusable service terms acceptance (e.g. Bridal Makeup) ---
  acceptedTermsId: text("accepted_terms_id"),
  acceptedTermsVersion: integer("accepted_terms_version"),
  acceptedTermsAt: text("accepted_terms_at"),
});

export const appointmentStatusHistory = sqliteTable("appointment_status_history", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  status: text("status").notNull(),
  changedByUserId: text("changed_by_user_id"),
  changedByRole: text("changed_by_role"),
  note: text("note"),
  timestamp: createdAt(),
});

export const customerReferences = sqliteTable("customer_references", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  url: text("url").notNull(),
  type: text("type", { enum: ["image", "video"] }).notNull(),
  uploadedAt: createdAt(),
});

export const completedWork = sqliteTable("completed_work", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  photoUrl: text("photo_url").notNull(),
  mediaType: text("media_type", { enum: ["image", "video"] }).notNull().default("image"),
  uploadedByUserId: text("uploaded_by_user_id").notNull(),
  uploadedAt: createdAt(),
  reviewStatus: text("review_status", {
    enum: ["pending_review", "approved", "needs_review", "issue_reported"],
  }).notNull().default("pending_review"),
  reviewedByUserId: text("reviewed_by_user_id"),
  reviewNote: text("review_note"),
  reviewedAt: text("reviewed_at"),
});

export const cancellations = sqliteTable("cancellations", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  cancelledByUserId: text("cancelled_by_user_id"),
  cancelledByRole: text("cancelled_by_role").notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  timestamp: createdAt(),
});

/** ---------- QUEUE (walk-ins) ---------- */
export const queueEntries = sqliteTable("queue_entries", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  joinedAt: createdAt(),
  position: integer("position").notNull(),
  status: text("status", {
    enum: ["waiting", "called", "in_service", "completed", "cancelled", "no_show"],
  }).notNull().default("waiting"),
});

/** ---------- ATTENDANCE ---------- */
export const attendance = sqliteTable("attendance", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  scheduledStart: text("scheduled_start"),
  loginAt: text("login_at"),
  checkInAt: text("check_in_at"),
  checkInVerified: integer("check_in_verified", { mode: "boolean" }),
  checkOutAt: text("check_out_at"),
  checkOutVerified: integer("check_out_verified", { mode: "boolean" }),
  status: text("status", {
    enum: ["on_time", "late", "absent", "not_checked_in", "checked_out"],
  }).notNull().default("not_checked_in"),
});

export const attendanceEvents = sqliteTable("attendance_events", {
  id: id(),
  attendanceId: text("attendance_id").notNull().references(() => attendance.id),
  type: text("type", {
    enum: ["login", "check_in", "check_out", "manual_correction"],
  }).notNull(),
  timestamp: createdAt(),
  locationLat: real("location_lat"),
  locationLng: real("location_lng"),
  verified: integer("verified", { mode: "boolean" }),
  correctedByUserId: text("corrected_by_user_id"),
  originalValue: text("original_value"),
  newValue: text("new_value"),
  reason: text("reason"),
});

/** ---------- PAYMENTS ---------- */
export const payments = sqliteTable("payments", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["cash", "mobile_money", "card", "bank_transfer"] }).notNull(),
  // NOTE: "paid" is the existing V1 value and is kept for backward
  // compatibility with existing rows/code; new states are additive.
  status: text("status", {
    enum: [
      "pending", "partial", "paid", "refunded", "disputed",
      "failed", "cancelled", "outstanding",
    ],
  }).notNull().default("pending"),
  recordedByUserId: text("recorded_by_user_id"),
  note: text("note"),
  timestamp: createdAt(),
  // --- V2: payment provider architecture ---
  provider: text("provider", { enum: ["manual", "mtn_momo", "card_gateway"] })
    .notNull()
    .default("manual"),
  paymentType: text("payment_type", { enum: ["deposit", "final", "full", "refund"] })
    .notNull()
    .default("full"),
  transactionReference: text("transaction_reference").unique(),
  externalId: text("external_id"),
  providerTransactionId: text("provider_transaction_id"),
  currency: text("currency").notNull().default("GHS"),
  refundStatus: text("refund_status", {
    enum: ["none", "requested", "processing", "refunded", "failed"],
  })
    .notNull()
    .default("none"),
  refundedAmount: real("refunded_amount").notNull().default(0),
  providerResponseMetadata: text("provider_response_metadata"), // JSON string, no secrets
});

/** ---------- REVIEWS ---------- */
export const reviews = sqliteTable("reviews", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  customerId: text("customer_id").references(() => users.id),
  overallRating: integer("overall_rating").notNull(),
  qualityRating: integer("quality_rating"),
  professionalismRating: integer("professionalism_rating"),
  communicationRating: integer("communication_rating"),
  respectfulnessRating: integer("respectfulness_rating"),
  punctualityRating: integer("punctuality_rating"),
  comment: text("comment"),
  moderated: integer("moderated", { mode: "boolean" }).notNull().default(false),
  hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** ---------- NOTIFICATIONS ---------- */
export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  relatedAppointmentId: text("related_appointment_id"),
  createdAt: createdAt(),
});

/** ---------- STAFF RULES ---------- */
export const staffRules = sqliteTable("staff_rules", {
  id: id(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  requiresAcknowledgement: integer("requires_acknowledgement", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const staffRuleAcknowledgements = sqliteTable("staff_rule_acknowledgements", {
  id: id(),
  ruleId: text("rule_id").notNull().references(() => staffRules.id),
  ruleVersion: integer("rule_version").notNull(),
  staffId: text("staff_id").notNull().references(() => users.id),
  acknowledgedAt: createdAt(),
});

/** ---------- AUDIT LOG ---------- */
export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  userId: text("user_id"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  timestamp: createdAt(),
});

/** ---------- GALLERY ---------- */
export const galleryImages = sqliteTable("gallery_images", {
  id: id(),
  category: text("category").notNull(), // e.g. "Braids", "Nails", "Lashes", "Styling"
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type", { enum: ["image", "video"] }).notNull().default("image"),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  uploadedByUserId: text("uploaded_by_user_id"),
  createdAt: createdAt(),
});

/** ---------- SALON SETTINGS (single row) ---------- */
export const salonSettings = sqliteTable("salon_settings", {
  id: text("id").primaryKey().default("main"),
  name: text("name").notNull().default("Hairtopia Studio"),
  logoUrl: text("logo_url"),
  address: text("address").notNull().default("266 Afro Osro Street"),
  mapUrl: text("map_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  phone: text("phone"),
  email: text("email").default("nikinuel@gmail.com"),
  instagram: text("instagram").default("@Hairtopia_Studio"),
  facebook: text("facebook").default("Hairtopia"),
  openTime: text("open_time").notNull().default("08:30"),
  closeTime: text("close_time").notNull().default("19:30"),
  checkInRadiusMeters: integer("check_in_radius_meters").notNull().default(100),
  attendanceGracePeriodMinutes: integer("attendance_grace_period_minutes").notNull().default(10),
  cancellationPolicy: text("cancellation_policy").notNull().default(
    "Please cancel at least 2 hours before your appointment where possible."
  ),
  noShowGraceMinutes: integer("no_show_grace_minutes").notNull().default(20),
  depositEnabled: integer("deposit_enabled", { mode: "boolean" }).notNull().default(true),
  depositPercent: integer("deposit_percent").notNull().default(20),
  depositFlatAmount: real("deposit_flat_amount").notNull().default(100), // GH₵100 flat per spec
  depositMode: text("deposit_mode", { enum: ["flat", "percent"] }).notNull().default("flat"),
  bookingBufferMinutes: integer("booking_buffer_minutes").notNull().default(15),
  cancellationWindowHours: integer("cancellation_window_hours").notNull().default(24),
  overbookingAllowed: integer("overbooking_allowed", { mode: "boolean" }).notNull().default(false),
  overtimeAllowedMinutes: integer("overtime_allowed_minutes").notNull().default(0),
  lowStockDefaultThreshold: integer("low_stock_default_threshold").notNull().default(5),
});

/** =====================================================================
 *  V2 ADDITIONS — additive only. No existing table above was dropped,
 *  renamed, or had a column removed. Safe to `drizzle-kit push` onto an
 *  existing V1 database without data loss.
 *  ===================================================================== */

/** Reusable, versioned terms & conditions attached to a specific service
 * (e.g. Bridal Makeup). Not hardcoded into the frontend — editable by
 * Owner/Admin, and the exact version a customer accepted is preserved on
 * the appointment itself. */
export const serviceTerms = sqliteTable("service_terms", {
  id: id(),
  serviceId: text("service_id").notNull().references(() => services.id),
  version: integer("version").notNull().default(1),
  title: text("title").notNull().default("Terms & Conditions"),
  content: text("content").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdByUserId: text("created_by_user_id"),
  createdAt: createdAt(),
});

/** Web Push subscriptions (PWA lock-screen/background notifications) — NOT
 * SMS/WhatsApp. One row per browser/device per user; endpoint is unique so
 * the same device re-subscribing updates rather than duplicates. */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  lastActiveAt: text("last_active_at"),
});

/** Reschedule requests preserve full history — every request a customer
 * makes (approved, declined, or superseded) stays in this table, separate
 * from the appointment's current live schedule. */
export const rescheduleRequests = sqliteTable("reschedule_requests", {
  id: id(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id),
  requestedDate: text("requested_date").notNull(),
  requestedTime: text("requested_time").notNull(),
  requestedStylistId: text("requested_stylist_id"), // null = keep current professional
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "declined", "superseded"] })
    .notNull()
    .default("pending"),
  requestedByUserId: text("requested_by_user_id"),
  requestedByRole: text("requested_by_role"),
  resolvedByUserId: text("resolved_by_user_id"),
  resolvedAt: text("resolved_at"),
  // Snapshot of the schedule being replaced, for a clean audit trail even
  // after the appointment itself has moved on.
  previousDate: text("previous_date").notNull(),
  previousTime: text("previous_time").notNull(),
  previousStylistId: text("previous_stylist_id"),
  createdAt: createdAt(),
});

/** Per-category push notification preferences. One row per user; every
 * category defaults to enabled. `pushEnabled` on `users` remains the
 * master switch — if it's off, nothing here matters, no push is sent
 * regardless of these categories. */
export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id),
  bookingEvents: integer("booking_events", { mode: "boolean" }).notNull().default(true),
  reminderEvents: integer("reminder_events", { mode: "boolean" }).notNull().default(true),
  paymentEvents: integer("payment_events", { mode: "boolean" }).notNull().default(true),
  consultationEvents: integer("consultation_events", { mode: "boolean" }).notNull().default(true),
  cancellationEvents: integer("cancellation_events", { mode: "boolean" }).notNull().default(true),
  staffEvents: integer("staff_events", { mode: "boolean" }).notNull().default(true), // rules, no-shows, HR
  queueEvents: integer("queue_events", { mode: "boolean" }).notNull().default(true), // arrivals, queue status
  systemEvents: integer("system_events", { mode: "boolean" }).notNull().default(true), // inventory, admin ops alerts
});

/** ---------- CLIENT CRM ----------
 * `clients` is the single source of truth for a person the salon has ever
 * served — whether they registered online (linkedUserId set) or were
 * created at the front desk as a walk-in (linkedUserId null). Online
 * bookings and walk-ins are matched to the SAME client row by normalized
 * phone number so "unique clients" is never inflated by repeat visits. */
export const clients = sqliteTable("clients", {
  id: id(),
  linkedUserId: text("linked_user_id").references(() => users.id), // set once they have an account
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(), // normalized E.164-ish, e.g. +233XXXXXXXXX
  whatsapp: text("whatsapp"),
  email: text("email"),
  preferredContact: text("preferred_contact", { enum: ["phone", "whatsapp", "email"] })
    .notNull()
    .default("phone"),

  // Hair & scalp intake
  hairType: text("hair_type"),
  hairLength: text("hair_length"),
  hairDensity: text("hair_density"),
  hairCondition: text("hair_condition"),
  scalpCondition: text("scalp_condition"),
  scalpConcerns: text("scalp_concerns"),
  chemicalHistory: text("chemical_history"),
  colourHistory: text("colour_history"),
  bleachHistory: text("bleach_history"),
  hairStatus: text("hair_status", {
    enum: ["natural", "relaxed", "transitioning", "colour_treated", "unspecified"],
  })
    .notNull()
    .default("unspecified"),
  protectiveStyleHistory: text("protective_style_history"),
  preferredProducts: text("preferred_products"),
  allergies: text("allergies"),
  sensitivities: text("sensitivities"),
  previousReactions: text("previous_reactions"),
  specialRequests: text("special_requests"),
  notes: text("notes"), // general front-of-house notes — treated as sensitive

  createdAt: createdAt(),
  updatedAt: text("updated_at"),
});

/** A single visit's clinical/service record, separate from the appointment's
 * operational status — this is what stylists actually read/write about a
 * client's hair on the day. */
export const clientVisits = sqliteTable("client_visits", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id),
  appointmentId: text("appointment_id").references(() => appointments.id),
  visitDate: text("visit_date").notNull(),
  serviceId: text("service_id").references(() => services.id),
  stylistId: text("stylist_id").references(() => users.id),
  hairConditionObserved: text("hair_condition_observed"),
  productsUsed: text("products_used"),
  outcome: text("outcome"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id"),
  createdAt: createdAt(),
});

/** Client photos: before/after/inspiration/service. Visibility is enforced
 * server-side, not just hidden in the UI. */
export const clientPhotos = sqliteTable("client_photos", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id),
  appointmentId: text("appointment_id").references(() => appointments.id),
  visitId: text("visit_id").references(() => clientVisits.id),
  url: text("url").notNull(),
  photoType: text("photo_type", {
    enum: ["before", "after", "inspiration", "service"],
  }).notNull(),
  visibility: text("visibility", {
    enum: ["private_staff", "assigned_stylist_only", "public"],
  })
    .notNull()
    .default("private_staff"),
  publicApproved: integer("public_approved", { mode: "boolean" }).notNull().default(false),
  uploadedByUserId: text("uploaded_by_user_id"),
  createdAt: createdAt(),
});

/** ---------- DISCOVERY CONSULTATIONS ---------- */
export const consultations = sqliteTable("consultations", {
  id: id(),
  clientId: text("client_id").references(() => clients.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  category: text("category").notNull(), // e.g. "Natural Hair", "Loc Maintenance"
  requestedStylistId: text("requested_stylist_id").references(() => users.id),
  requestedCategory: text("requested_category"),
  preferredDate: text("preferred_date"),
  preferredTime: text("preferred_time"),
  hairInfoSnapshot: text("hair_info_snapshot"), // JSON snapshot of intake at request time
  concerns: text("concerns").notNull(),
  notes: text("notes"),
  status: text("status", {
    enum: ["requested", "under_review", "recommendation_sent", "scheduled", "converted", "declined", "completed"],
  })
    .notNull()
    .default("requested"),
  reviewedByUserId: text("reviewed_by_user_id"),
  staffRecommendation: text("staff_recommendation"),
  suggestedServiceId: text("suggested_service_id").references(() => services.id),
  suggestedPrice: real("suggested_price"),
  suggestedDurationMinutes: integer("suggested_duration_minutes"),
  convertedAppointmentId: text("converted_appointment_id").references(() => appointments.id),
  createdAt: createdAt(),
  updatedAt: text("updated_at"),
});

export const consultationPhotos = sqliteTable("consultation_photos", {
  id: id(),
  consultationId: text("consultation_id").notNull().references(() => consultations.id),
  url: text("url").notNull(),
  caption: text("caption"),
  createdAt: createdAt(),
});

/** ---------- STAFF HR ---------- */
export const staffContracts = sqliteTable("staff_contracts", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  contractType: text("contract_type").notNull(), // e.g. "Full-time", "Contractor"
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  terms: text("terms"),
  status: text("status", { enum: ["active", "ended", "terminated"] }).notNull().default("active"),
  documentUrl: text("document_url"),
  version: integer("version").notNull().default(1),
  acknowledgedAt: text("acknowledged_at"),
  createdByUserId: text("created_by_user_id"),
  createdAt: createdAt(),
});

export const staffWarnings = sqliteTable("staff_warnings", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  level: text("level", {
    enum: ["verbal", "written", "final", "termination"],
  }).notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  issuedByUserId: text("issued_by_user_id").notNull(),
  issuedAt: createdAt(),
  acknowledgedAt: text("acknowledged_at"),
  evidenceUrl: text("evidence_url"),
});

export const staffNoShows = sqliteTable("staff_no_shows", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledStart: text("scheduled_start"),
  reason: text("reason"),
  status: text("status", { enum: ["unexcused", "excused", "under_review"] })
    .notNull()
    .default("under_review"),
  recordedByUserId: text("recorded_by_user_id"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const staffAdvances = sqliteTable("staff_advances", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  entryType: text("entry_type", {
    enum: ["advance", "deduction", "repayment", "no_show_debit"],
  }).notNull(),
  amount: real("amount").notNull(),
  reason: text("reason"),
  balanceAfter: real("balance_after").notNull(),
  recordedByUserId: text("recorded_by_user_id").notNull(),
  createdAt: createdAt(),
});

export const uniformIssues = sqliteTable("uniform_issues", {
  id: id(),
  staffId: text("staff_id").notNull().references(() => users.id),
  item: text("item").notNull(),
  size: text("size"),
  quantity: integer("quantity").notNull().default(1),
  issueDate: text("issue_date").notNull(),
  returnDate: text("return_date"),
  condition: text("condition"),
  status: text("status", { enum: ["issued", "returned", "lost", "damaged"] })
    .notNull()
    .default("issued"),
  notes: text("notes"),
  recordedByUserId: text("recorded_by_user_id"),
  createdAt: createdAt(),
});

/** ---------- INVENTORY ---------- */
export const inventoryItems = sqliteTable("inventory_items", {
  id: id(),
  name: text("name").notNull(),
  category: text("category"),
  sku: text("sku").unique(),
  description: text("description"),
  photoUrl: text("photo_url"),
  supplier: text("supplier"),
  cost: real("cost"),
  sellingPrice: real("selling_price"),
  quantity: integer("quantity").notNull().default(0),
  minThreshold: integer("min_threshold").notNull().default(5),
  unit: text("unit").notNull().default("unit"),
  location: text("location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const inventoryMovements = sqliteTable("inventory_movements", {
  id: id(),
  itemId: text("item_id").notNull().references(() => inventoryItems.id),
  movementType: text("movement_type", {
    enum: ["stock_in", "stock_out", "adjustment", "damaged", "used", "transferred"],
  }).notNull(),
  quantityChange: integer("quantity_change").notNull(), // signed
  previousQuantity: integer("previous_quantity").notNull(),
  newQuantity: integer("new_quantity").notNull(),
  reason: text("reason"),
  recordedByUserId: text("recorded_by_user_id").notNull(),
  createdAt: createdAt(),
});
