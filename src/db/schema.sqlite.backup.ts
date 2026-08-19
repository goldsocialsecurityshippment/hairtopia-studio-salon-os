import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => text("created_at").notNull().default(sql`(current_timestamp)`);

/** ---------- USERS & ROLES ---------- */
export const users = sqliteTable("users", {
  id: id(),
  role: text("role", { enum: ["customer", "stylist", "manager", "owner"] }).notNull(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
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
  source: text("source", { enum: ["online", "walk_in", "qr"] }).notNull().default("online"),
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
  status: text("status", {
    enum: ["pending", "partial", "paid", "refunded", "disputed"],
  }).notNull().default("pending"),
  recordedByUserId: text("recorded_by_user_id"),
  note: text("note"),
  timestamp: createdAt(),
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
  depositEnabled: integer("deposit_enabled", { mode: "boolean" }).notNull().default(false),
  depositPercent: integer("deposit_percent").notNull().default(20),
  bookingBufferMinutes: integer("booking_buffer_minutes").notNull().default(15),
});
