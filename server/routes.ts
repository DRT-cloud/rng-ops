import type { Express, Request, Response } from "express";
import express from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  parseSquadText,
  parseSlotName,
  splitSlotName,
  matchSlotToEntry,
  normalizeDivisionKey,
  normalizeNameForPerson,
  canonicalDivision,
  generateScheduledStarts,
  detectSpacingConflicts,
  rawSeconds,
  type ParsedSquad,
  type RegEntry,
} from "./domain";
import type { PenaltyDef, DayDef, Entry, Slot } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(express.json({ limit: "10mb" }));

  // ---------- Event ----------
  app.get("/api/event", (_req, res) => {
    const ev = storage.getActiveEvent();
    res.json(ev ?? null);
  });

  app.post("/api/event", (req, res) => {
    const { name, startDate, endDate, timezone, defaultIntervalMinutes, divisions, penalties, days } = req.body;
    if (!name || !startDate || !endDate) return res.status(400).json({ error: "Missing required fields" });
    const ev = storage.createEvent({
      name, startDate, endDate,
      timezone: timezone || "America/Chicago",
      defaultIntervalMinutes: defaultIntervalMinutes ?? 4,
      divisions: JSON.stringify(divisions ?? []),
      penalties: JSON.stringify(penalties ?? []),
      days: JSON.stringify(days ?? []),
    });
    storage.addAudit({
      eventId: ev.id, entityType: "event", entityId: ev.id, field: "create", oldValue: null, newValue: null,
      reason: "Event created", timestamp: new Date().toISOString(),
    });
    res.json(ev);
  });

  app.patch("/api/event/:id", (req, res) => {
    const id = Number(req.params.id);
    const patch: any = {};
    const { defaultIntervalMinutes, divisions, penalties, days, name, startDate, endDate, timezone } = req.body;
    if (name !== undefined) patch.name = name;
    if (startDate !== undefined) patch.startDate = startDate;
    if (endDate !== undefined) patch.endDate = endDate;
    if (timezone !== undefined) patch.timezone = timezone;
    if (defaultIntervalMinutes !== undefined) patch.defaultIntervalMinutes = defaultIntervalMinutes;
    if (divisions !== undefined) patch.divisions = JSON.stringify(divisions);
    if (penalties !== undefined) patch.penalties = JSON.stringify(penalties);
    if (days !== undefined) patch.days = JSON.stringify(days);
    const ev = storage.updateEvent(id, patch);
    res.json(ev);
  });

  app.post("/api/event/reset", (_req, res) => {
    storage.clearAll();
    res.json({ ok: true });
  });

  // ---------- Import: parse only ----------
  app.post("/api/parse/registrations", (req, res) => {
    const { rows } = req.body as { rows: Record<string, string>[] };
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows[] required" });
    // Summarize
    const divisionsSeen: Record<string, number> = {};
    for (const r of rows) {
      const d = r["Division"] ?? r["division"] ?? "";
      divisionsSeen[d] = (divisionsSeen[d] ?? 0) + 1;
    }
    res.json({ rowCount: rows.length, divisionsSeen });
  });

  app.post("/api/parse/squads", (req, res) => {
    const { text } = req.body as { text: string };
    if (!text) return res.status(400).json({ error: "text required" });
    const parsed = parseSquadText(text);
    res.json({ parsed });
  });

  // ---------- Import: commit ----------
  // Body: { csvRows: [...], squadText: "...", event: {...} }
  app.post("/api/import/commit", (req, res) => {
    const { csvRows, squadText, event } = req.body as {
      csvRows: Record<string, string>[];
      squadText: string;
      event: {
        name: string; startDate: string; endDate: string; timezone?: string;
        defaultIntervalMinutes: number;
        divisions: string[];
        penalties: PenaltyDef[];
        days: DayDef[];
      };
    };
    if (!csvRows || !squadText || !event) return res.status(400).json({ error: "Missing payload" });

    const ev = storage.createEvent({
      name: event.name, startDate: event.startDate, endDate: event.endDate,
      timezone: event.timezone || "America/Chicago",
      defaultIntervalMinutes: event.defaultIntervalMinutes ?? 4,
      divisions: JSON.stringify(event.divisions ?? []),
      penalties: JSON.stringify(event.penalties ?? []),
      days: JSON.stringify(event.days ?? []),
    });

    const nowIso = new Date().toISOString();

    // 1. Insert entries
    const insertedEntries: Entry[] = [];
    for (const row of csvRows) {
      const first = (row["First Name"] ?? "").trim();
      const last = (row["Last Name"] ?? "").trim();
      if (!first && !last) continue;
      const divRaw = (row["Division"] ?? "").trim();
      const divNorm = canonicalDivision(divRaw, event.divisions);
      const e = storage.createEntry({
        eventId: ev.id,
        personId: null,
        firstName: first,
        lastName: last,
        displayName: `${first} ${last}`.trim(),
        divisionRaw: divRaw || null,
        divisionNormalized: divNorm,
        squadRaw: (row["Squad"] ?? "").trim() || null,
        squadNormalized: (row["Squad"] ?? "").trim() || null,
        email: (row["Email"] ?? "").trim() || null,
        phone: (row["Phone Number"] ?? "").trim() || null,
        approvalStatus: (row["Approval Status"] ?? "").trim() || null,
        paidStatus: (row["Paid Status"] ?? "").trim() || null,
        shirtSize: (row["Shirt Size"] ?? "").trim() || null,
        notes: (row["Notes"] ?? "").trim() || null,
        pmmLink: (row["PMM Link"] ?? "").trim() || null,
        runnerNumber: null,
      });
      insertedEntries.push(e);
      storage.upsertAttendance({
        eventId: ev.id, entryId: e.id, arrivalStatus: "Not Checked In", checkedInAt: null, notes: null,
      });
      storage.upsertTiming({
        eventId: ev.id, entryId: e.id,
        scheduledStart: null, actualStart: null, finish: null, rawSeconds: null, raceStatus: "Scheduled",
      });
    }

    // 2. Person linking: group entries by normalized email + normalized name
    type GroupKey = string;
    const groups = new Map<GroupKey, Entry[]>();
    for (const e of insertedEntries) {
      const emailKey = (e.email ?? "").toLowerCase().trim();
      const nameKey = normalizeNameForPerson(e.firstName, e.lastName);
      const key = emailKey || `name:${nameKey}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    groups.forEach((arr) => {
      const first = arr[0];
      const person = storage.createPerson({
        eventId: ev.id,
        normalizedName: normalizeNameForPerson(first.firstName, first.lastName),
        displayName: first.displayName,
        email: first.email,
        phone: first.phone,
      });
      for (const e of arr) {
        storage.updateEntry(e.id, { personId: person.id });
      }
    });

    // 3. Parse squad PDF text and create squads+slots
    const parsed = parseSquadText(squadText);
    const daysMap = new Map<string, string>(); // label -> date
    for (const d of (event.days ?? [])) daysMap.set(d.label.toLowerCase(), d.date);

    const regEntries: RegEntry[] = storage.listEntries(ev.id).map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      divisionRaw: e.divisionRaw,
      divisionNormalized: e.divisionNormalized,
      email: e.email,
      phone: e.phone,
    }));

    // Track which entries have been assigned — used to prefer unassigned when a single entry multi-matches
    const assignedEntryIds = new Set<number>();

    for (const block of parsed) {
      const date = block.dayLabel ? daysMap.get(block.dayLabel.toLowerCase()) ?? event.startDate : event.startDate;
      const starts = block.type === "timed" && block.timeWindow
        ? generateScheduledStarts(date, block.timeWindow.startHour, block.timeWindow.endHour, event.defaultIntervalMinutes, block.slots.length)
        : [];

      const s = storage.createSquad({
        eventId: ev.id,
        label: block.label,
        squadNumber: block.squadNumber,
        type: block.type,
        dayLabel: block.dayLabel,
        date,
        windowStart: block.timeWindow ? `${date}T${String(block.timeWindow.startHour).padStart(2, "0")}:00:00` : null,
        windowEnd: block.timeWindow ? `${date}T${String(block.timeWindow.endHour).padStart(2, "0")}:00:00` : null,
        intervalMinutes: block.type === "timed" ? event.defaultIntervalMinutes : null,
        sortOrder: block.sortOrder,
      });

      for (let i = 0; i < block.slots.length; i++) {
        const slot = block.slots[i];
        const raw = slot.rawLabel;
        let slotType: "competitor" | "open" | "staff" = "competitor";
        let matchStatus: "matched" | "unmatched" | "ambiguous" | null = null;
        let matchCandidatesJson = "[]";
        let entryId: number | null = null;

        if (/^(Reserved|Empty)$/i.test(raw.trim())) {
          slotType = "open";
        } else {
          if (block.type === "staff") slotType = "staff";
          const parsedName = parseSlotName(raw);
          // Try match, preferring unassigned entries when multiple candidates
          const result = matchSlotToEntry(parsedName.name, parsedName.division, regEntries);
          if (result.status === "matched") {
            entryId = result.entryId;
            matchStatus = "matched";
          } else if (result.status === "ambiguous") {
            // Prefer unassigned + division match
            const unused = result.candidates.filter(c => !assignedEntryIds.has(c.entryId));
            if (unused.length === 1) {
              entryId = unused[0].entryId;
              matchStatus = "matched";
            } else {
              matchStatus = "ambiguous";
              matchCandidatesJson = JSON.stringify(result.candidates);
            }
          } else {
            matchStatus = "unmatched";
          }
        }

        const scheduled = block.type === "timed" ? starts[i] ?? null : null;

        const slotRow = storage.createSlot({
          eventId: ev.id,
          squadId: s.id,
          position: slot.position,
          rawLabel: raw,
          slotType,
          scheduledStart: scheduled,
          originalEntryId: entryId,
          activeEntryId: entryId,
          matchStatus,
          matchCandidates: matchCandidatesJson,
        });

        if (entryId) {
          assignedEntryIds.add(entryId);
          // Set timing.scheduledStart
          storage.upsertTiming({
            eventId: ev.id,
            entryId,
            scheduledStart: scheduled,
            actualStart: null,
            finish: null,
            rawSeconds: null,
            raceStatus: "Scheduled",
          });
        }
      }
    }

    storage.addAudit({
      eventId: ev.id, entityType: "import", entityId: ev.id, field: null, oldValue: null, newValue: null,
      reason: `Imported ${csvRows.length} registrations and ${parsed.length} squads`, timestamp: nowIso,
    });

    res.json({ eventId: ev.id, entriesImported: insertedEntries.length, squadsImported: parsed.length });
  });

  // ---------- Read: run list, entries, attendance, timing ----------
  app.get("/api/runlist", (_req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.json({ squads: [], slots: [], entries: [], timings: [], attendance: [], penalties: [] });
    const squads = storage.listSquads(ev.id);
    const slots = storage.listSlots(ev.id);
    const entriesArr = storage.listEntries(ev.id);
    const timings = storage.listTimings(ev.id);
    const attendance = storage.listAttendance(ev.id);
    const penalties = storage.listPenaltyApplications(ev.id).filter(p => !p.removed);
    res.json({ event: ev, squads, slots, entries: entriesArr, timings, attendance, penalties });
  });

  // ---------- Check-in ----------
  app.post("/api/checkin/:entryId", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const { arrivalStatus, notes } = req.body as { arrivalStatus: string; notes?: string };
    const prior = storage.getAttendance(entryId);
    const row = storage.upsertAttendance({
      eventId: ev.id,
      entryId,
      arrivalStatus,
      checkedInAt: arrivalStatus === "Checked In" || arrivalStatus === "Late Arrival" ? new Date().toISOString() : (prior?.checkedInAt ?? null),
      notes: notes ?? prior?.notes ?? null,
    });
    storage.addAudit({
      eventId: ev.id, entityType: "attendance", entityId: entryId, field: "arrivalStatus",
      oldValue: prior?.arrivalStatus ?? null, newValue: arrivalStatus, reason: null, timestamp: new Date().toISOString(),
    });
    res.json(row);
  });

  // ---------- Start / Finish ----------
  app.post("/api/start/:entryId", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const { actualStart, runnerNumber } = req.body as { actualStart?: string; runnerNumber?: number };
    const ts = actualStart ?? new Date().toISOString();
    const prior = storage.getTiming(entryId);
    const t = storage.upsertTiming({
      eventId: ev.id, entryId,
      scheduledStart: prior?.scheduledStart ?? null,
      actualStart: ts,
      finish: prior?.finish ?? null,
      rawSeconds: rawSeconds(ts, prior?.finish ?? null),
      raceStatus: "Started",
    });
    if (runnerNumber != null) {
      storage.updateEntry(entryId, { runnerNumber });
    }
    storage.addAudit({
      eventId: ev.id, entityType: "timing", entityId: entryId, field: "actualStart",
      oldValue: prior?.actualStart ?? null, newValue: ts, reason: null, timestamp: new Date().toISOString(),
    });
    res.json(t);
  });

  app.post("/api/finish/:entryId", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const { finish } = req.body as { finish?: string };
    const ts = finish ?? new Date().toISOString();
    const prior = storage.getTiming(entryId);
    const t = storage.upsertTiming({
      eventId: ev.id, entryId,
      scheduledStart: prior?.scheduledStart ?? null,
      actualStart: prior?.actualStart ?? null,
      finish: ts,
      rawSeconds: rawSeconds(prior?.actualStart ?? null, ts),
      raceStatus: "Finished",
    });
    storage.addAudit({
      eventId: ev.id, entityType: "timing", entityId: entryId, field: "finish",
      oldValue: prior?.finish ?? null, newValue: ts, reason: null, timestamp: new Date().toISOString(),
    });
    res.json(t);
  });

  app.post("/api/timing/:entryId", (req, res) => {
    // Generic timing edit (actualStart, finish, raceStatus)
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const prior = storage.getTiming(entryId);
    const { actualStart, finish, raceStatus, scheduledStart } = req.body as {
      actualStart?: string | null; finish?: string | null; raceStatus?: string; scheduledStart?: string | null;
    };
    const next = {
      eventId: ev.id,
      entryId,
      scheduledStart: scheduledStart !== undefined ? scheduledStart : (prior?.scheduledStart ?? null),
      actualStart: actualStart !== undefined ? actualStart : (prior?.actualStart ?? null),
      finish: finish !== undefined ? finish : (prior?.finish ?? null),
      rawSeconds: 0,
      raceStatus: raceStatus ?? prior?.raceStatus ?? "Scheduled",
    };
    next.rawSeconds = rawSeconds(next.actualStart, next.finish) ?? 0;
    const t = storage.upsertTiming(next);
    storage.addAudit({
      eventId: ev.id, entityType: "timing", entityId: entryId, field: "edit",
      oldValue: JSON.stringify(prior ?? {}), newValue: JSON.stringify(next), reason: null, timestamp: new Date().toISOString(),
    });
    res.json(t);
  });

  // ---------- Penalties ----------
  app.post("/api/penalty/:entryId", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const { code, label, seconds } = req.body as { code: string; label: string; seconds: number };
    const p = storage.addPenalty({
      eventId: ev.id, entryId, code, label, seconds,
      appliedAt: new Date().toISOString(), removed: 0, removedAt: null,
    });
    storage.addAudit({
      eventId: ev.id, entityType: "penalty", entityId: p.id, field: "apply",
      oldValue: null, newValue: `${code}:${seconds}s`, reason: null, timestamp: new Date().toISOString(),
    });
    res.json(p);
  });

  app.delete("/api/penalty/:id", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const id = Number(req.params.id);
    const p = storage.removePenalty(id);
    storage.addAudit({
      eventId: ev.id, entityType: "penalty", entityId: id, field: "remove",
      oldValue: null, newValue: null, reason: null, timestamp: new Date().toISOString(),
    });
    res.json(p);
  });

  // ---------- Runner number ----------
  app.post("/api/runner-number/:entryId", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const entryId = Number(req.params.entryId);
    const { runnerNumber } = req.body as { runnerNumber: number | null };
    const prior = storage.getEntry(entryId);
    const e = storage.updateEntry(entryId, { runnerNumber });
    storage.addAudit({
      eventId: ev.id, entityType: "entry", entityId: entryId, field: "runnerNumber",
      oldValue: String(prior?.runnerNumber ?? ""), newValue: String(runnerNumber ?? ""),
      reason: null, timestamp: new Date().toISOString(),
    });
    res.json(e);
  });

  // ---------- Slot manual move (active schedule) ----------
  // Move an entry from one slot to another open slot (must be empty or marked "open").
  app.post("/api/slot/:id/assign", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const slotId = Number(req.params.id);
    const { entryId } = req.body as { entryId: number | null };
    const prior = storage.getSlot(slotId);
    if (!prior) return res.status(404).json({ error: "Slot not found" });

    // If previously assigned somewhere, clear that slot's activeEntryId
    if (entryId != null) {
      const slotsAll = storage.listSlots(ev.id);
      for (const s of slotsAll) {
        if (s.activeEntryId === entryId && s.id !== slotId) {
          storage.updateSlot(s.id, { activeEntryId: null });
        }
      }
    }
    const updated = storage.updateSlot(slotId, { activeEntryId: entryId });
    // Update timing.scheduledStart to new slot's scheduledStart
    if (entryId != null) {
      const t = storage.getTiming(entryId);
      storage.upsertTiming({
        eventId: ev.id, entryId,
        scheduledStart: prior.scheduledStart,
        actualStart: t?.actualStart ?? null,
        finish: t?.finish ?? null,
        rawSeconds: t?.rawSeconds ?? null,
        raceStatus: t?.raceStatus ?? "Scheduled",
      });
    }
    storage.addAudit({
      eventId: ev.id, entityType: "slot", entityId: slotId, field: "activeEntryId",
      oldValue: String(prior.activeEntryId ?? ""), newValue: String(entryId ?? ""),
      reason: null, timestamp: new Date().toISOString(),
    });
    res.json(updated);
  });

  // ---------- Auto-compression ----------
  // Pulls future un-started runners forward into earlier open slots on the same day,
  // preserving squad-level scheduled-start order. Does not touch started/finished runners.
  app.post("/api/compress", (_req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const squads = storage.listSquads(ev.id).filter(s => s.type === "timed");
    const slotsAll = storage.listSlots(ev.id);
    const timings = new Map(storage.listTimings(ev.id).map(t => [t.entryId, t]));
    const attend = new Map(storage.listAttendance(ev.id).map(a => [a.entryId, a]));

    let moved = 0;
    for (const sq of squads) {
      const slots = slotsAll.filter(s => s.squadId === sq.id).sort((a, b) => a.position - b.position);
      // gather active runners in order: skip started, skip no-show, skip withdrawn
      const activeRunners: { slot: Slot; entryId: number }[] = [];
      for (const s of slots) {
        if (s.activeEntryId) {
          const t = timings.get(s.activeEntryId);
          const a = attend.get(s.activeEntryId);
          if (t?.raceStatus === "Scheduled" && a?.arrivalStatus !== "No Show" && a?.arrivalStatus !== "Withdrawn") {
            activeRunners.push({ slot: s, entryId: s.activeEntryId });
          }
        }
      }
      // Refill slots from start
      for (let i = 0; i < slots.length; i++) {
        const target = slots[i];
        const newAssignee = activeRunners[i]?.entryId ?? null;
        // Don't disturb started/finished slots
        if (target.activeEntryId) {
          const t = timings.get(target.activeEntryId);
          if (t?.raceStatus === "Started" || t?.raceStatus === "Finished") continue;
        }
        if (target.activeEntryId !== newAssignee) {
          storage.updateSlot(target.id, { activeEntryId: newAssignee });
          if (newAssignee) {
            const t = timings.get(newAssignee);
            storage.upsertTiming({
              eventId: ev.id, entryId: newAssignee,
              scheduledStart: target.scheduledStart,
              actualStart: t?.actualStart ?? null,
              finish: t?.finish ?? null,
              rawSeconds: t?.rawSeconds ?? null,
              raceStatus: t?.raceStatus ?? "Scheduled",
            });
          }
          moved++;
        }
      }
    }
    storage.addAudit({
      eventId: ev.id, entityType: "schedule", entityId: null, field: "compress", oldValue: null, newValue: String(moved),
      reason: "Auto-compression", timestamp: new Date().toISOString(),
    });
    res.json({ moved });
  });

  // ---------- Match resolution ----------
  app.post("/api/slot/:id/match", (req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.status(400).json({ error: "No event" });
    const slotId = Number(req.params.id);
    const { entryId } = req.body as { entryId: number | null };
    const prior = storage.getSlot(slotId);
    if (!prior) return res.status(404).json({ error: "Slot not found" });
    const updated = storage.updateSlot(slotId, {
      originalEntryId: entryId,
      activeEntryId: entryId,
      matchStatus: entryId ? "matched" : "unmatched",
      matchCandidates: "[]",
    });
    if (entryId) {
      const t = storage.getTiming(entryId);
      storage.upsertTiming({
        eventId: ev.id, entryId,
        scheduledStart: prior.scheduledStart,
        actualStart: t?.actualStart ?? null,
        finish: t?.finish ?? null,
        rawSeconds: t?.rawSeconds ?? null,
        raceStatus: t?.raceStatus ?? "Scheduled",
      });
    }
    storage.addAudit({
      eventId: ev.id, entityType: "slot", entityId: slotId, field: "match",
      oldValue: String(prior.originalEntryId ?? ""), newValue: String(entryId ?? ""),
      reason: "Manual match", timestamp: new Date().toISOString(),
    });
    res.json(updated);
  });

  // ---------- Exceptions ----------
  app.get("/api/exceptions", (_req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.json({ items: [] });
    const slotsAll = storage.listSlots(ev.id);
    const entries = storage.listEntries(ev.id);
    const entriesMap = new Map(entries.map(e => [e.id, e]));
    const timings = storage.listTimings(ev.id);
    const timingsMap = new Map(timings.map(t => [t.entryId, t]));
    const attend = storage.listAttendance(ev.id);
    const attendMap = new Map(attend.map(a => [a.entryId, a]));
    const squads = storage.listSquads(ev.id);
    const squadsMap = new Map(squads.map(s => [s.id, s]));

    const items: any[] = [];

    // Ambiguous / unmatched slots
    for (const s of slotsAll) {
      if (s.matchStatus === "ambiguous") {
        items.push({
          type: "ambiguous_match",
          slotId: s.id,
          squadLabel: squadsMap.get(s.squadId)?.label,
          rawLabel: s.rawLabel,
          candidates: JSON.parse(s.matchCandidates ?? "[]"),
        });
      } else if (s.matchStatus === "unmatched" && s.slotType !== "open") {
        items.push({
          type: "unmatched_slot",
          slotId: s.id,
          squadLabel: squadsMap.get(s.squadId)?.label,
          rawLabel: s.rawLabel,
        });
      }
    }

    // Unmatched entries: entries not referenced by any slot
    const usedEntryIds = new Set(slotsAll.map(s => s.originalEntryId).filter((x): x is number => x != null));
    for (const e of entries) {
      if (!usedEntryIds.has(e.id)) {
        items.push({ type: "unmatched_entry", entryId: e.id, displayName: e.displayName, division: e.divisionNormalized });
      }
    }

    // Finish without start
    for (const t of timings) {
      if (t.finish && !t.actualStart) {
        items.push({ type: "finish_without_start", entryId: t.entryId, displayName: entriesMap.get(t.entryId)?.displayName });
      }
      if (t.finish && t.actualStart) {
        const r = rawSeconds(t.actualStart, t.finish);
        if (r == null || r < 0) {
          items.push({ type: "invalid_duration", entryId: t.entryId, displayName: entriesMap.get(t.entryId)?.displayName, raw: r });
        }
      }
    }

    // No-show still in active queue
    for (const s of slotsAll) {
      if (s.activeEntryId) {
        const a = attendMap.get(s.activeEntryId);
        if (a?.arrivalStatus === "No Show" || a?.arrivalStatus === "Withdrawn") {
          items.push({
            type: "no_show_in_queue",
            slotId: s.id,
            entryId: s.activeEntryId,
            displayName: entriesMap.get(s.activeEntryId)?.displayName,
            squadLabel: squadsMap.get(s.squadId)?.label,
          });
        }
      }
    }

    // Same-person same-day spacing conflicts
    const list = slotsAll
      .filter(s => s.activeEntryId)
      .map(s => {
        const e = entriesMap.get(s.activeEntryId!);
        return { entryId: s.activeEntryId!, personId: e?.personId ?? null, scheduledStart: s.scheduledStart };
      });
    const conflicts = detectSpacingConflicts(list, 90);
    for (const c of conflicts) {
      items.push({
        type: "spacing_conflict",
        personId: c.personId,
        entryA: c.entryA,
        entryB: c.entryB,
        displayNameA: entriesMap.get(c.entryA)?.displayName,
        displayNameB: entriesMap.get(c.entryB)?.displayName,
        separationMinutes: c.separationMinutes,
        requiredMinutes: c.requiredMinutes,
        date: c.date,
      });
    }

    res.json({ items });
  });

  // ---------- Audit ----------
  app.get("/api/audits", (_req, res) => {
    const ev = storage.getActiveEvent();
    if (!ev) return res.json([]);
    res.json(storage.listAudits(ev.id));
  });

  return httpServer;
}
