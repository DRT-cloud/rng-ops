import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// --- Event (single active event at a time; we just use row id=1) ---
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD (event day 1)
  endDate: text("end_date").notNull(),     // YYYY-MM-DD (event last day)
  timezone: text("timezone").notNull().default("America/Chicago"),
  defaultIntervalMinutes: integer("default_interval_minutes").notNull().default(4),
  // JSON: string[] canonical divisions e.g. ["2-Gun","PCC","NV 2-Gun","NV PCC"]
  divisions: text("divisions").notNull().default("[]"),
  // JSON: Penalty[] [{code, label, seconds}]
  penalties: text("penalties").notNull().default("[]"),
  // JSON: DaySchedule[] [{label:"Friday", date:"2026-05-15"}, ...]
  days: text("days").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

// --- Person (grouped identities across entries) ---
export const persons = sqliteTable("persons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  normalizedName: text("normalized_name").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  phone: text("phone"),
});

// --- Entry (one per registration row) ---
export const entries = sqliteTable("entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  personId: integer("person_id"), // nullable until linked

  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  displayName: text("display_name").notNull(),

  divisionRaw: text("division_raw"),
  divisionNormalized: text("division_normalized"),

  squadRaw: text("squad_raw"),         // value from CSV "Squad"
  squadNormalized: text("squad_normalized"),

  email: text("email"),
  phone: text("phone"),
  approvalStatus: text("approval_status"),
  paidStatus: text("paid_status"),
  shirtSize: text("shirt_size"),
  notes: text("notes"),
  pmmLink: text("pmm_link"),

  // runner number assigned at start-line
  runnerNumber: integer("runner_number"),
});

// --- Squad (parsed from PDF) ---
export const squads = sqliteTable("squads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  label: text("label").notNull(),          // e.g. "FRIDAY 10:00-11:00 1"
  squadNumber: text("squad_number"),       // "1", "11", etc
  type: text("type").notNull(),            // "timed" | "staff"
  dayLabel: text("day_label"),             // "Friday" | "Saturday" | null
  date: text("date"),                      // YYYY-MM-DD
  windowStart: text("window_start"),       // ISO timestamp (full) or null
  windowEnd: text("window_end"),           // ISO timestamp (full) or null
  intervalMinutes: integer("interval_minutes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// --- Slot (one per position in a squad) ---
export const slots = sqliteTable("slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  squadId: integer("squad_id").notNull(),
  position: integer("position").notNull(),
  // slot label from PDF: "Reserved" | "Empty" | a name string
  rawLabel: text("raw_label"),
  // Treat Reserved/Empty as "open"
  slotType: text("slot_type").notNull(), // "competitor" | "open" | "staff"
  scheduledStart: text("scheduled_start"), // ISO timestamp for timed squads

  originalEntryId: integer("original_entry_id"), // immutable once set
  activeEntryId: integer("active_entry_id"),     // can be moved

  // match metadata
  matchStatus: text("match_status"), // "matched" | "unmatched" | "ambiguous"
  matchCandidates: text("match_candidates").default("[]"), // JSON: [{entryId,score}]
});

// --- Attendance ---
export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  entryId: integer("entry_id").notNull().unique(),
  arrivalStatus: text("arrival_status").notNull().default("Not Checked In"),
  checkedInAt: text("checked_in_at"),
  notes: text("notes"),
});

// --- Timing ---
export const timings = sqliteTable("timings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  entryId: integer("entry_id").notNull().unique(),
  scheduledStart: text("scheduled_start"),
  actualStart: text("actual_start"),
  finish: text("finish"),
  rawSeconds: integer("raw_seconds"),
  raceStatus: text("race_status").notNull().default("Scheduled"),
});

// --- Penalty application ---
export const penaltyApplications = sqliteTable("penalty_applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  entryId: integer("entry_id").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  seconds: integer("seconds").notNull(),
  appliedAt: text("applied_at").notNull(),
  removed: integer("removed").notNull().default(0),
  removedAt: text("removed_at"),
});

// --- Audit log ---
export const audits = sqliteTable("audits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  timestamp: text("timestamp").notNull(),
});

// --- Schemas ---
export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export const insertEntrySchema = createInsertSchema(entries).omit({ id: true });
export const insertSquadSchema = createInsertSchema(squads).omit({ id: true });
export const insertSlotSchema = createInsertSchema(slots).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertTimingSchema = createInsertSchema(timings).omit({ id: true });
export const insertPenaltyApplicationSchema = createInsertSchema(penaltyApplications).omit({ id: true });
export const insertAuditSchema = createInsertSchema(audits).omit({ id: true });
export const insertPersonSchema = createInsertSchema(persons).omit({ id: true });

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Person = typeof persons.$inferSelect;
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Entry = typeof entries.$inferSelect;
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type Squad = typeof squads.$inferSelect;
export type InsertSquad = z.infer<typeof insertSquadSchema>;
export type Slot = typeof slots.$inferSelect;
export type InsertSlot = z.infer<typeof insertSlotSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Timing = typeof timings.$inferSelect;
export type InsertTiming = z.infer<typeof insertTimingSchema>;
export type PenaltyApplication = typeof penaltyApplications.$inferSelect;
export type InsertPenaltyApplication = z.infer<typeof insertPenaltyApplicationSchema>;
export type Audit = typeof audits.$inferSelect;
export type InsertAudit = z.infer<typeof insertAuditSchema>;

// Supporting DTO types (serialized in events.penalties / events.divisions / events.days)
export type PenaltyDef = { code: string; label: string; seconds: number };
export type DayDef = { label: string; date: string };
