/**
 * Match scoring API routes (Phase 2 rebuild).
 *
 * All routes mounted under /api/match/* to coexist with the legacy biathlon
 * routes during transition.
 *
 * Endpoint summary:
 *   POST   /api/match/events                       create event
 *   GET    /api/match/events                       list events
 *   GET    /api/match/events/:id                   get event detail (with divisions, stages, obstacles)
 *   PATCH  /api/match/events/:id                   update event
 *   DELETE /api/match/events/:id                   delete event
 *   POST   /api/match/events/:id/activate          set as active event
 *   GET    /api/match/active                       get currently active event detail
 *
 *   POST   /api/match/events/:id/divisions        create division
 *   DELETE /api/match/divisions/:id                delete division
 *
 *   POST   /api/match/events/:id/stages            create stage
 *   DELETE /api/match/stages/:id                   delete stage
 *   POST   /api/match/stages/:id/penalty-types     add stage penalty type
 *   POST   /api/match/stages/:id/bonus-types       add stage bonus type
 *
 *   POST   /api/match/events/:id/obstacles         create obstacle
 *   DELETE /api/match/obstacles/:id                delete obstacle
 *   POST   /api/match/obstacles/:id/penalty-types  add obstacle penalty type
 *   POST   /api/match/obstacles/:id/bonus-types    add obstacle bonus type
 *
 *   POST   /api/match/events/:id/competitors       create competitor
 *   PATCH  /api/match/competitors/:id              update competitor
 *   DELETE /api/match/competitors/:id              delete competitor
 *   POST   /api/match/competitors/:id/check-in     mark checked in
 *   POST   /api/match/competitors/:id/no-show      mark no_show
 *   POST   /api/match/competitors/:id/dq           match-level DQ
 *   POST   /api/match/competitors/:id/restore      restore to checked_in
 *   POST   /api/match/events/:id/competitors/import   bulk import from CSV rows
 *
 *   POST   /api/match/competitors/:id/run-start    record start (auto-stamps now if no body.ms)
 *   POST   /api/match/competitors/:id/run-finish   record finish
 *   POST   /api/match/competitors/:id/run          set start/finish/status manually
 *
 *   GET    /api/match/stages/:id/entries           competitor list with entry status for that stage (for tablet UI)
 *   GET    /api/match/competitors/:cid/stages/:sid stage entry detail (for editing)
 *   POST   /api/match/competitors/:cid/stages/:sid save stage entry (the RO save button)
 *
 *   POST   /api/match/competitors/:cid/obstacles/:oid save obstacle entry
 *
 *   GET    /api/match/events/:id/results           full computed results (run + stages + match totals)
 */

import type { Express } from 'express';
import express from 'express';
import { matchStorage } from './match-storage';
import { computeResults } from './scoring/engine';

export function registerMatchRoutes(app: Express): void {
  // express.json is already registered by the legacy registerRoutes() call.

  // ---------- Events ----------
  app.post('/api/match/events', (req, res) => {
    const { name, eventDate, runMaxPoints } = req.body ?? {};
    if (!name || !eventDate) return res.status(400).json({ error: 'name and eventDate required' });
    const ev = matchStorage.createEvent({ name, eventDate, runMaxPoints });
    res.json(ev);
  });

  app.get('/api/match/events', (_req, res) => {
    res.json(matchStorage.listEvents());
  });

  app.get('/api/match/events/:id', (req, res) => {
    const id = Number(req.params.id);
    const event = matchStorage.getEvent(id);
    if (!event) return res.status(404).json({ error: 'not found' });
    res.json(buildEventDetail(id));
  });

  app.patch('/api/match/events/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = matchStorage.getEvent(id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    matchStorage.updateEvent({
      id,
      name: req.body?.name ?? cur.name,
      eventDate: req.body?.eventDate ?? cur.event_date,
      runMaxPoints: req.body?.runMaxPoints ?? cur.run_max_points,
    });
    res.json(matchStorage.getEvent(id));
  });

  app.delete('/api/match/events/:id', (req, res) => {
    matchStorage.deleteEvent(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/match/events/:id/activate', (req, res) => {
    matchStorage.setActiveEvent(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/match/active', (_req, res) => {
    const ev = matchStorage.getActiveEvent();
    if (!ev) return res.json(null);
    res.json(buildEventDetail(ev.id));
  });

  // ---------- Divisions ----------
  app.post('/api/match/events/:id/divisions', (req, res) => {
    const eventId = Number(req.params.id);
    const { code, name, sortOrder } = req.body ?? {};
    if (!code || !name) return res.status(400).json({ error: 'code and name required' });
    res.json(matchStorage.createDivision({ eventId, code, name, sortOrder }));
  });
  app.delete('/api/match/divisions/:id', (req, res) => {
    matchStorage.deleteDivision(Number(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Stages ----------
  app.post('/api/match/events/:id/stages', (req, res) => {
    const eventId = Number(req.params.id);
    const { name, sequence, maxPoints } = req.body ?? {};
    if (!name || sequence == null) return res.status(400).json({ error: 'name and sequence required' });
    res.json(matchStorage.createStage({ eventId, name, sequence, maxPoints }));
  });
  app.delete('/api/match/stages/:id', (req, res) => {
    matchStorage.deleteStage(Number(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/match/stages/:id/penalty-types', (req, res) => {
    const ownerId = Number(req.params.id);
    const { name, seconds, sortOrder } = req.body ?? {};
    if (!name || seconds == null) return res.status(400).json({ error: 'name and seconds required' });
    res.json(matchStorage.createPenType({ ownerKind: 'stage', ownerId, name, seconds, sortOrder }));
  });
  app.post('/api/match/stages/:id/bonus-types', (req, res) => {
    const ownerId = Number(req.params.id);
    const { name, seconds, sortOrder } = req.body ?? {};
    if (!name || seconds == null) return res.status(400).json({ error: 'name and seconds required' });
    res.json(matchStorage.createBonType({ ownerKind: 'stage', ownerId, name, seconds, sortOrder }));
  });

  // ---------- Obstacles ----------
  app.post('/api/match/events/:id/obstacles', (req, res) => {
    const eventId = Number(req.params.id);
    const { name, sequence } = req.body ?? {};
    if (!name || sequence == null) return res.status(400).json({ error: 'name and sequence required' });
    res.json(matchStorage.createObstacle({ eventId, name, sequence }));
  });
  app.delete('/api/match/obstacles/:id', (req, res) => {
    matchStorage.deleteObstacle(Number(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/match/obstacles/:id/penalty-types', (req, res) => {
    const ownerId = Number(req.params.id);
    const { name, seconds, sortOrder } = req.body ?? {};
    if (!name || seconds == null) return res.status(400).json({ error: 'name and seconds required' });
    res.json(matchStorage.createPenType({ ownerKind: 'obstacle', ownerId, name, seconds, sortOrder }));
  });
  app.post('/api/match/obstacles/:id/bonus-types', (req, res) => {
    const ownerId = Number(req.params.id);
    const { name, seconds, sortOrder } = req.body ?? {};
    if (!name || seconds == null) return res.status(400).json({ error: 'name and seconds required' });
    res.json(matchStorage.createBonType({ ownerKind: 'obstacle', ownerId, name, seconds, sortOrder }));
  });

  // ---------- Competitors ----------
  app.get('/api/match/events/:id/competitors', (req, res) => {
    const eventId = Number(req.params.id);
    const event = matchStorage.getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'event not found' });
    res.json(matchStorage.listCompetitors(eventId));
  });

  app.post('/api/match/events/:id/competitors', (req, res) => {
    const eventId = Number(req.params.id);
    const { bib, firstName, lastName, divisionId, status, notes } = req.body ?? {};
    if (!bib || !firstName || !lastName || !divisionId) {
      return res.status(400).json({ error: 'bib, firstName, lastName, divisionId required' });
    }
    try {
      matchStorage.assertBibUnique(eventId, bib);
      const c = matchStorage.createCompetitor({
        eventId,
        bib,
        firstName,
        lastName,
        divisionId,
        status,
        notes,
      });
      res.json(c);
    } catch (e: any) {
      res.status(409).json({ error: e.message });
    }
  });

  app.patch('/api/match/competitors/:id', (req, res) => {
    const id = Number(req.params.id);
    const cur = matchStorage.getCompetitor(id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const next = {
      id,
      bib: req.body?.bib ?? cur.bib,
      firstName: req.body?.firstName ?? cur.first_name,
      lastName: req.body?.lastName ?? cur.last_name,
      divisionId: req.body?.divisionId ?? cur.division_id,
      status: (req.body?.status ?? cur.status) as 'registered' | 'checked_in' | 'no_show' | 'dq',
      notes: req.body?.notes ?? cur.notes,
    };
    try {
      if (next.bib !== cur.bib) {
        matchStorage.assertBibUnique(cur.event_id, next.bib, id);
      }
      matchStorage.updateCompetitor(next);
      res.json(matchStorage.getCompetitor(id));
    } catch (e: any) {
      res.status(409).json({ error: e.message });
    }
  });

  app.delete('/api/match/competitors/:id', (req, res) => {
    matchStorage.deleteCompetitor(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/match/competitors/:id/check-in', (req, res) => {
    matchStorage.setCompetitorStatus(Number(req.params.id), 'checked_in');
    res.json({ ok: true });
  });
  app.post('/api/match/competitors/:id/no-show', (req, res) => {
    matchStorage.setCompetitorStatus(Number(req.params.id), 'no_show');
    res.json({ ok: true });
  });
  app.post('/api/match/competitors/:id/dq', (req, res) => {
    matchStorage.setCompetitorStatus(Number(req.params.id), 'dq');
    res.json({ ok: true });
  });
  app.post('/api/match/competitors/:id/restore', (req, res) => {
    matchStorage.setCompetitorStatus(Number(req.params.id), 'checked_in');
    res.json({ ok: true });
  });

  /**
   * Bulk import competitors from a CSV-derived array.
   * Body: { rows: Array<{ bib, firstName, lastName, divisionCode }> }
   * Skips rows whose bib is already in use; returns counts.
   */
  app.post('/api/match/events/:id/competitors/import', (req, res) => {
    const eventId = Number(req.params.id);
    const event = matchStorage.getEvent(eventId);
    if (!event) return res.status(404).json({ error: 'event not found' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const divisions = matchStorage.listDivisions(eventId);
    const divByCode = new Map(divisions.map((d) => [d.code, d.id]));

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const r of rows) {
      const bib = String(r?.bib ?? '').trim();
      const first = String(r?.firstName ?? '').trim();
      const last = String(r?.lastName ?? '').trim();
      const divCode = String(r?.divisionCode ?? '').trim();
      if (!bib || !first || !last || !divCode) {
        skipped++;
        errors.push(`Skipped: missing field in row ${JSON.stringify(r)}`);
        continue;
      }
      const divisionId = divByCode.get(divCode);
      if (divisionId == null) {
        skipped++;
        errors.push(`Skipped bib ${bib}: unknown division "${divCode}"`);
        continue;
      }
      try {
        matchStorage.assertBibUnique(eventId, bib);
        matchStorage.createCompetitor({
          eventId,
          bib,
          firstName: first,
          lastName: last,
          divisionId,
          status: 'registered',
        });
        added++;
      } catch (e: any) {
        skipped++;
        errors.push(`Skipped bib ${bib}: ${e.message}`);
      }
    }
    res.json({ added, skipped, errors });
  });

  // ---------- Run start/finish ----------
  app.get('/api/match/events/:id/runs', (req, res) => {
    const eventId = Number(req.params.id);
    if (!matchStorage.getEvent(eventId)) return res.status(404).json({ error: 'event not found' });
    const records = matchStorage.listRunRecords(eventId);
    const map: Record<number, { start_ms: number | null; finish_ms: number | null; status: string }> = {};
    for (const r of records) {
      map[r.competitor_id] = { start_ms: r.start_ms, finish_ms: r.finish_ms, status: r.status };
    }
    res.json(map);
  });

  app.post('/api/match/competitors/:id/run-start', (req, res) => {
    const id = Number(req.params.id);
    const c = matchStorage.getCompetitor(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const ms = req.body?.ms != null ? Number(req.body.ms) : Date.now();
    const cur = matchStorage.getRunRecord(id);
    matchStorage.upsertRunRecord({
      competitorId: id,
      startMs: ms,
      finishMs: cur?.finish_ms ?? null,
      status: cur?.status ?? 'ok',
    });
    res.json({ ok: true, startMs: ms });
  });
  app.post('/api/match/competitors/:id/run-finish', (req, res) => {
    const id = Number(req.params.id);
    const c = matchStorage.getCompetitor(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const ms = req.body?.ms != null ? Number(req.body.ms) : Date.now();
    const cur = matchStorage.getRunRecord(id);
    matchStorage.upsertRunRecord({
      competitorId: id,
      startMs: cur?.start_ms ?? null,
      finishMs: ms,
      status: cur?.status ?? 'ok',
    });
    res.json({ ok: true, finishMs: ms });
  });
  app.post('/api/match/competitors/:id/run', (req, res) => {
    const id = Number(req.params.id);
    const c = matchStorage.getCompetitor(id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const startMs = req.body?.startMs ?? null;
    const finishMs = req.body?.finishMs ?? null;
    const status = (req.body?.status ?? 'ok') as 'ok' | 'no_show' | 'dq';
    matchStorage.upsertRunRecord({ competitorId: id, startMs, finishMs, status });
    res.json({ ok: true });
  });

  // ---------- Stage tablet endpoints ----------
  /**
   * For the stage tablet: list all competitors for the active event, with
   * a flag for whether they've been scored on this stage yet.
   */
  app.get('/api/match/stages/:id/entries', (req, res) => {
    const stageId = Number(req.params.id);
    // Find the event for this stage:
    const allEvents = matchStorage.listEvents();
    let eventId: number | null = null;
    for (const e of allEvents) {
      if (matchStorage.listStages(e.id).some((s) => s.id === stageId)) {
        eventId = e.id;
        break;
      }
    }
    if (eventId == null) return res.status(404).json({ error: 'stage not found' });

    const competitors = matchStorage.listCompetitors(eventId);
    const divisions = matchStorage.listDivisions(eventId);
    const divById = new Map(divisions.map((d) => [d.id, d]));

    const entries = competitors.map((c) => {
      const entry = matchStorage.getStageEntry(c.id, stageId);
      return {
        competitorId: c.id,
        bib: c.bib,
        firstName: c.first_name,
        lastName: c.last_name,
        divisionCode: divById.get(c.division_id)?.code ?? '',
        matchStatus: c.status,
        stageStatus: entry.record?.status ?? null,
        scored: entry.record != null,
      };
    });
    res.json({ stageId, eventId, entries });
  });

  /**
   * Detail for editing one competitor's stage entry.
   * Returns current record + pen/bon counts + the type definitions.
   */
  app.get('/api/match/competitors/:cid/stages/:sid', (req, res) => {
    const cid = Number(req.params.cid);
    const sid = Number(req.params.sid);
    const competitor = matchStorage.getCompetitor(cid);
    if (!competitor) return res.status(404).json({ error: 'competitor not found' });
    const entry = matchStorage.getStageEntry(cid, sid);
    const penaltyTypes = matchStorage.listPenTypes('stage', sid);
    const bonusTypes = matchStorage.listBonTypes('stage', sid);
    res.json({
      competitor,
      record: entry.record,
      penaltyCounts: entry.penaltyCounts,
      bonusCounts: entry.bonusCounts,
      penaltyTypes,
      bonusTypes,
    });
  });

  /**
   * The RO Save button. Body:
   *   {
   *     rawTimeSeconds: number | null,   // null if dq/no_show
   *     waitTimeSeconds: number,         // already converted from MM:SS
   *     status: 'ok' | 'no_show' | 'dq',
   *     penaltyCounts: { [penTypeId]: number },
   *     bonusCounts: { [bonTypeId]: number }
   *   }
   */
  app.post('/api/match/competitors/:cid/stages/:sid', (req, res) => {
    const cid = Number(req.params.cid);
    const sid = Number(req.params.sid);
    const body = req.body ?? {};
    matchStorage.saveStageEntry({
      competitorId: cid,
      stageId: sid,
      rawTimeSeconds: body.rawTimeSeconds ?? null,
      waitTimeSeconds: Number(body.waitTimeSeconds ?? 0),
      status: (body.status ?? 'ok') as 'ok' | 'no_show' | 'dq',
      penaltyCounts: body.penaltyCounts ?? {},
      bonusCounts: body.bonusCounts ?? {},
    });
    res.json({ ok: true });
  });

  // ---------- Obstacle tablet endpoints ----------
  /** List of competitors with scored flag for this obstacle. */
  app.get('/api/match/obstacles/:id/entries', (req, res) => {
    const oid = Number(req.params.id);
    const obs = matchStorage.getObstacle(oid);
    if (!obs) return res.status(404).json({ error: 'obstacle not found' });
    const eventId = obs.event_id;
    const competitors = matchStorage.listCompetitors(eventId);
    const divisions = matchStorage.listDivisions(eventId);
    const divById = new Map(divisions.map((d) => [d.id, d]));
    const entries = competitors.map((c) => {
      const e = matchStorage.getObstacleEntry(c.id, oid);
      const scored =
        Object.values(e.penaltyCounts).some((v) => v > 0) ||
        Object.values(e.bonusCounts).some((v) => v > 0);
      return {
        competitorId: c.id,
        bib: c.bib,
        firstName: c.first_name,
        lastName: c.last_name,
        divisionCode: divById.get(c.division_id)?.code ?? '',
        matchStatus: c.status,
        scored,
      };
    });
    res.json({ obstacleId: oid, eventId, entries });
  });

  /** Detail for editing one competitor's obstacle entry. */
  app.get('/api/match/competitors/:cid/obstacles/:oid', (req, res) => {
    const cid = Number(req.params.cid);
    const oid = Number(req.params.oid);
    const competitor = matchStorage.getCompetitor(cid);
    if (!competitor) return res.status(404).json({ error: 'competitor not found' });
    const entry = matchStorage.getObstacleEntry(cid, oid);
    const penaltyTypes = matchStorage.listPenTypes('obstacle', oid);
    const bonusTypes = matchStorage.listBonTypes('obstacle', oid);
    res.json({
      competitor,
      penaltyCounts: entry.penaltyCounts,
      bonusCounts: entry.bonusCounts,
      penaltyTypes,
      bonusTypes,
    });
  });

  app.post('/api/match/competitors/:cid/obstacles/:oid', (req, res) => {
    const cid = Number(req.params.cid);
    const oid = Number(req.params.oid);
    const body = req.body ?? {};
    matchStorage.saveObstacleEntry({
      competitorId: cid,
      obstacleId: oid,
      penaltyCounts: body.penaltyCounts ?? {},
      bonusCounts: body.bonusCounts ?? {},
    });
    res.json({ ok: true });
  });

  // ---------- Results ----------
  app.get('/api/match/events/:id/results', (req, res) => {
    const id = Number(req.params.id);
    const event = matchStorage.getEvent(id);
    if (!event) return res.status(404).json({ error: 'not found' });
    const input = matchStorage.buildScoringInput(id);
    const output = computeResults(input);
    res.json({ event, results: output });
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function buildEventDetail(id: number) {
  const event = matchStorage.getEvent(id)!;
  const divisions = matchStorage.listDivisions(id);
  const stages = matchStorage.listStages(id).map((s) => ({
    ...s,
    penaltyTypes: matchStorage.listPenTypes('stage', s.id),
    bonusTypes: matchStorage.listBonTypes('stage', s.id),
  }));
  const obstacles = matchStorage.listObstacles(id).map((o) => ({
    ...o,
    penaltyTypes: matchStorage.listPenTypes('obstacle', o.id),
    bonusTypes: matchStorage.listBonTypes('obstacle', o.id),
  }));
  return { event, divisions, stages, obstacles };
}
