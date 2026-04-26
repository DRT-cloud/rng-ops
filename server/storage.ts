import {
  events, persons, entries, squads, slots, attendance, timings, penaltyApplications, audits,
  type Event, type InsertEvent,
  type Person, type InsertPerson,
  type Entry, type InsertEntry,
  type Squad, type InsertSquad,
  type Slot, type InsertSlot,
  type Attendance, type InsertAttendance,
  type Timing, type InsertTiming,
  type PenaltyApplication, type InsertPenaltyApplication,
  type Audit, type InsertAudit,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, asc } from "drizzle-orm";

// DB path is configurable so hosts like Fly.io can mount a persistent volume.
// Default is ./data.db in the working directory (works locally and in Docker).
const DB_PATH = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create tables on startup
sqlite.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  default_interval_minutes INTEGER NOT NULL DEFAULT 4,
  divisions TEXT NOT NULL DEFAULT '[]',
  penalties TEXT NOT NULL DEFAULT '[]',
  days TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  person_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  division_raw TEXT,
  division_normalized TEXT,
  squad_raw TEXT,
  squad_normalized TEXT,
  email TEXT,
  phone TEXT,
  approval_status TEXT,
  paid_status TEXT,
  shirt_size TEXT,
  notes TEXT,
  pmm_link TEXT,
  runner_number INTEGER
);
CREATE TABLE IF NOT EXISTS squads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  squad_number TEXT,
  type TEXT NOT NULL,
  day_label TEXT,
  date TEXT,
  window_start TEXT,
  window_end TEXT,
  interval_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  squad_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  raw_label TEXT,
  slot_type TEXT NOT NULL,
  scheduled_start TEXT,
  original_entry_id INTEGER,
  active_entry_id INTEGER,
  match_status TEXT,
  match_candidates TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL UNIQUE,
  arrival_status TEXT NOT NULL DEFAULT 'Not Checked In',
  checked_in_at TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS timings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL UNIQUE,
  scheduled_start TEXT,
  actual_start TEXT,
  finish TEXT,
  raw_seconds INTEGER,
  race_status TEXT NOT NULL DEFAULT 'Scheduled'
);
CREATE TABLE IF NOT EXISTS penalty_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  removed_at TEXT
);
CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_slots_squad ON slots(squad_id, position);
CREATE INDEX IF NOT EXISTS ix_entries_event ON entries(event_id);
CREATE INDEX IF NOT EXISTS ix_squads_event ON squads(event_id, sort_order);
`);

export const db = drizzle(sqlite);

// ---- Storage interface ----
export const storage = {
  // events
  getActiveEvent(): Event | undefined {
    return db.select().from(events).orderBy(asc(events.id)).get();
  },
  getEvent(id: number): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  },
  createEvent(data: InsertEvent): Event {
    // Delete previous event cascade (single-event app)
    storage.clearAll();
    return db.insert(events).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  },
  updateEvent(id: number, patch: Partial<InsertEvent>): Event {
    return db.update(events).set(patch).where(eq(events.id, id)).returning().get();
  },
  clearAll() {
    sqlite.exec(`
      DELETE FROM audits;
      DELETE FROM penalty_applications;
      DELETE FROM timings;
      DELETE FROM attendance;
      DELETE FROM slots;
      DELETE FROM squads;
      DELETE FROM entries;
      DELETE FROM persons;
      DELETE FROM events;
    `);
  },

  // entries
  listEntries(eventId: number): Entry[] {
    return db.select().from(entries).where(eq(entries.eventId, eventId)).all();
  },
  getEntry(id: number): Entry | undefined {
    return db.select().from(entries).where(eq(entries.id, id)).get();
  },
  createEntry(data: InsertEntry): Entry {
    return db.insert(entries).values(data).returning().get();
  },
  updateEntry(id: number, patch: Partial<InsertEntry>): Entry {
    return db.update(entries).set(patch).where(eq(entries.id, id)).returning().get();
  },

  // persons
  listPersons(eventId: number): Person[] {
    return db.select().from(persons).where(eq(persons.eventId, eventId)).all();
  },
  createPerson(data: InsertPerson): Person {
    return db.insert(persons).values(data).returning().get();
  },

  // squads / slots
  listSquads(eventId: number): Squad[] {
    return db.select().from(squads).where(eq(squads.eventId, eventId)).orderBy(asc(squads.sortOrder)).all();
  },
  createSquad(data: InsertSquad): Squad {
    return db.insert(squads).values(data).returning().get();
  },
  listSlots(eventId: number): Slot[] {
    return db.select().from(slots).where(eq(slots.eventId, eventId)).orderBy(asc(slots.squadId), asc(slots.position)).all();
  },
  listSlotsForSquad(squadId: number): Slot[] {
    return db.select().from(slots).where(eq(slots.squadId, squadId)).orderBy(asc(slots.position)).all();
  },
  createSlot(data: InsertSlot): Slot {
    return db.insert(slots).values(data).returning().get();
  },
  updateSlot(id: number, patch: Partial<InsertSlot>): Slot {
    return db.update(slots).set(patch).where(eq(slots.id, id)).returning().get();
  },
  getSlot(id: number): Slot | undefined {
    return db.select().from(slots).where(eq(slots.id, id)).get();
  },

  // attendance
  listAttendance(eventId: number): Attendance[] {
    return db.select().from(attendance).where(eq(attendance.eventId, eventId)).all();
  },
  getAttendance(entryId: number): Attendance | undefined {
    return db.select().from(attendance).where(eq(attendance.entryId, entryId)).get();
  },
  upsertAttendance(data: InsertAttendance): Attendance {
    const existing = db.select().from(attendance).where(eq(attendance.entryId, data.entryId)).get();
    if (existing) {
      return db.update(attendance).set(data).where(eq(attendance.id, existing.id)).returning().get();
    }
    return db.insert(attendance).values(data).returning().get();
  },

  // timings
  listTimings(eventId: number): Timing[] {
    return db.select().from(timings).where(eq(timings.eventId, eventId)).all();
  },
  getTiming(entryId: number): Timing | undefined {
    return db.select().from(timings).where(eq(timings.entryId, entryId)).get();
  },
  upsertTiming(data: InsertTiming): Timing {
    const existing = db.select().from(timings).where(eq(timings.entryId, data.entryId)).get();
    if (existing) {
      return db.update(timings).set(data).where(eq(timings.id, existing.id)).returning().get();
    }
    return db.insert(timings).values(data).returning().get();
  },

  // penalties
  listPenaltyApplications(eventId: number): PenaltyApplication[] {
    return db.select().from(penaltyApplications).where(eq(penaltyApplications.eventId, eventId)).all();
  },
  listPenaltiesForEntry(entryId: number): PenaltyApplication[] {
    return db.select().from(penaltyApplications).where(eq(penaltyApplications.entryId, entryId)).all();
  },
  addPenalty(data: InsertPenaltyApplication): PenaltyApplication {
    return db.insert(penaltyApplications).values(data).returning().get();
  },
  removePenalty(id: number): PenaltyApplication {
    return db.update(penaltyApplications)
      .set({ removed: 1, removedAt: new Date().toISOString() })
      .where(eq(penaltyApplications.id, id))
      .returning().get();
  },

  // audits
  addAudit(data: InsertAudit): Audit {
    return db.insert(audits).values(data).returning().get();
  },
  listAudits(eventId: number): Audit[] {
    return db.select().from(audits).where(eq(audits.eventId, eventId)).orderBy(asc(audits.id)).all();
  },
};
