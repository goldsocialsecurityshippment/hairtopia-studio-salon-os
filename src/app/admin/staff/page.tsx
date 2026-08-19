import { db } from "@/db";
import { users, staffProfiles, attendance, reviews, appointments } from "@/db/schema";
import { eq, inArray, avg, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/actions/auth";
import { AddStaffForm } from "./AddStaffForm";
import { StaffCard } from "./StaffCard";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function AdminStaffPage() {
  const session = await getCurrentUser();
  const staff = await db.select().from(users).where(inArray(users.role, ["stylist", "manager"]));
  const profiles = await db.select().from(staffProfiles);
  const todaysAttendance = await db.select().from(attendance).where(eq(attendance.date, today()));

  const ratings = await db
    .select({ stylistId: appointments.stylistId, avgRating: avg(reviews.overallRating), reviewCount: count(reviews.id) })
    .from(reviews)
    .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
    .groupBy(appointments.stylistId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Staff</h1>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="space-y-4">
            {staff.map((s) => {
              const profile = profiles.find((p) => p.userId === s.id);
              const attend = todaysAttendance.find((a) => a.staffId === s.id);
              const rating = ratings.find((r) => r.stylistId === s.id);
              return (
                <StaffCard
                  key={s.id}
                  staff={{
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    active: s.active,
                    bio: profile?.bio ?? null,
                    specialties: profile?.specialties ?? null,
                    yearsExperience: profile?.yearsExperience ?? null,
                  }}
                  attendanceStatus={attend?.status ?? "not_checked_in"}
                  avgRating={rating?.avgRating ? Number(rating.avgRating) : null}
                  reviewCount={rating?.reviewCount ?? 0}
                  canManage={session?.role === "owner" || s.role === "stylist"}
                />
              );
            })}
          </div>
        </div>

        {session?.role === "owner" && (
          <div>
            <AddStaffForm />
          </div>
        )}
      </div>
    </div>
  );
}
