/**
 * Match API client (Phase 2).
 *
 * Thin wrapper over fetch with consistent error surfacing. All endpoints are
 * served by server/match-routes.ts under /api/match/*.
 */

const API_BASE = '';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new Error(`${res.status}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- Types ----------

export interface MatchEvent {
  id: number;
  name: string;
  event_date: string;
  is_active: number;
  run_max_points: number;
  created_at: number;
}

export interface Division {
  id: number;
  event_id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface PenType {
  id: number;
  owner_kind: 'stage' | 'obstacle';
  owner_id: number;
  name: string;
  seconds: number;
  sort_order: number;
}

export interface BonType extends PenType {}

export interface Stage {
  id: number;
  event_id: number;
  name: string;
  sequence: number;
  max_points: number;
  penaltyTypes: PenType[];
  bonusTypes: BonType[];
}

export interface Obstacle {
  id: number;
  event_id: number;
  name: string;
  sequence: number;
  penaltyTypes: PenType[];
  bonusTypes: BonType[];
}

export interface EventDetail {
  event: MatchEvent;
  divisions: Division[];
  stages: Stage[];
  obstacles: Obstacle[];
}

export interface Competitor {
  id: number;
  event_id: number;
  bib: string;
  first_name: string;
  last_name: string;
  division_id: number;
  status: 'registered' | 'checked_in' | 'no_show' | 'dq';
  notes: string | null;
}

export interface StageEntryRow {
  competitorId: number;
  bib: string;
  firstName: string;
  lastName: string;
  divisionCode: string;
  matchStatus: Competitor['status'];
  stageStatus: 'ok' | 'no_show' | 'dq' | null;
  scored: boolean;
}

export interface StageEntryDetail {
  competitor: Competitor;
  record: {
    competitor_id: number;
    stage_id: number;
    raw_time_seconds: number | null;
    wait_time_seconds: number;
    status: 'ok' | 'no_show' | 'dq';
  } | null;
  penaltyCounts: Record<string, number>;
  bonusCounts: Record<string, number>;
  penaltyTypes: PenType[];
  bonusTypes: BonType[];
}

export interface RunResultRow {
  place: number | null;
  competitorId: string;
  bib: string;
  name: string;
  divisionCode: string;
  rawTimeSeconds: number | null;
  penaltySeconds: number;
  bonusSeconds: number;
  timeSeconds: number | null;
  points: number;
  percent: number;
  status: 'ok' | 'no_show' | 'dq';
}
export interface StageResultRow {
  place: number | null;
  competitorId: string;
  bib: string;
  name: string;
  divisionCode: string;
  rawTimeSeconds: number | null;
  penaltySeconds: number;
  bonusSeconds: number;
  timeSeconds: number | null;
  points: number;
  percent: number;
  status: 'ok' | 'no_show' | 'dq';
}
export interface MatchTotalRow {
  place: number | null;
  competitorId: string;
  bib: string;
  name: string;
  divisionCode: string;
  runPoints: number;
  stagePoints: Record<string, number>;
  totalPoints: number;
}
export interface ResultsResponse {
  event: MatchEvent;
  results: {
    runByDivision: Record<string, RunResultRow[]>;
    stageByDivision: Record<string, Record<string, StageResultRow[]>>;
    matchByDivision: Record<string, MatchTotalRow[]>;
  };
}

// ---------- Endpoints ----------

export const matchApi = {
  // events
  listEvents: () => request<MatchEvent[]>('GET', '/api/match/events'),
  getEvent: (id: number) => request<EventDetail>('GET', `/api/match/events/${id}`),
  getActive: () => request<EventDetail | null>('GET', '/api/match/active'),
  createEvent: (data: { name: string; eventDate: string; runMaxPoints?: number }) =>
    request<MatchEvent>('POST', '/api/match/events', data),
  updateEvent: (id: number, data: Partial<{ name: string; eventDate: string; runMaxPoints: number }>) =>
    request<MatchEvent>('PATCH', `/api/match/events/${id}`, data),
  deleteEvent: (id: number) => request<{ ok: true }>('DELETE', `/api/match/events/${id}`),
  activateEvent: (id: number) => request<{ ok: true }>('POST', `/api/match/events/${id}/activate`),

  // divisions
  createDivision: (eventId: number, data: { code: string; name: string; sortOrder?: number }) =>
    request<Division>('POST', `/api/match/events/${eventId}/divisions`, data),
  deleteDivision: (id: number) => request<{ ok: true }>('DELETE', `/api/match/divisions/${id}`),

  // stages
  createStage: (eventId: number, data: { name: string; sequence: number; maxPoints?: number }) =>
    request<Stage>('POST', `/api/match/events/${eventId}/stages`, data),
  deleteStage: (id: number) => request<{ ok: true }>('DELETE', `/api/match/stages/${id}`),
  addStagePenalty: (id: number, data: { name: string; seconds: number; sortOrder?: number }) =>
    request<PenType>('POST', `/api/match/stages/${id}/penalty-types`, data),
  addStageBonus: (id: number, data: { name: string; seconds: number; sortOrder?: number }) =>
    request<BonType>('POST', `/api/match/stages/${id}/bonus-types`, data),

  // obstacles
  createObstacle: (eventId: number, data: { name: string; sequence: number }) =>
    request<Obstacle>('POST', `/api/match/events/${eventId}/obstacles`, data),
  deleteObstacle: (id: number) => request<{ ok: true }>('DELETE', `/api/match/obstacles/${id}`),
  addObstaclePenalty: (id: number, data: { name: string; seconds: number; sortOrder?: number }) =>
    request<PenType>('POST', `/api/match/obstacles/${id}/penalty-types`, data),
  addObstacleBonus: (id: number, data: { name: string; seconds: number; sortOrder?: number }) =>
    request<BonType>('POST', `/api/match/obstacles/${id}/bonus-types`, data),

  // competitors
  listCompetitors: (eventId: number) =>
    request<Competitor[]>('GET', `/api/match/events/${eventId}/competitors`),
  createCompetitor: (
    eventId: number,
    data: {
      bib: string;
      firstName: string;
      lastName: string;
      divisionId: number;
      status?: Competitor['status'];
      notes?: string;
    },
  ) => request<Competitor>('POST', `/api/match/events/${eventId}/competitors`, data),
  updateCompetitor: (id: number, data: Partial<Competitor> & { firstName?: string; lastName?: string; divisionId?: number }) =>
    request<Competitor>('PATCH', `/api/match/competitors/${id}`, data),
  deleteCompetitor: (id: number) => request<{ ok: true }>('DELETE', `/api/match/competitors/${id}`),
  checkIn: (id: number) => request<{ ok: true }>('POST', `/api/match/competitors/${id}/check-in`),
  noShow: (id: number) => request<{ ok: true }>('POST', `/api/match/competitors/${id}/no-show`),
  dq: (id: number) => request<{ ok: true }>('POST', `/api/match/competitors/${id}/dq`),
  restore: (id: number) => request<{ ok: true }>('POST', `/api/match/competitors/${id}/restore`),
  importCompetitors: (
    eventId: number,
    rows: Array<{ bib: string; firstName: string; lastName: string; divisionCode: string }>,
  ) => request<{ added: number; skipped: number; errors: string[] }>(
    'POST',
    `/api/match/events/${eventId}/competitors/import`,
    { rows },
  ),

  // run timing
  listRuns: (eventId: number) =>
    request<Record<number, { start_ms: number | null; finish_ms: number | null; status: 'ok' | 'no_show' | 'dq' }>>(
      'GET',
      `/api/match/events/${eventId}/runs`,
    ),
  runStart: (id: number, ms?: number) =>
    request<{ ok: true; startMs: number }>('POST', `/api/match/competitors/${id}/run-start`, ms != null ? { ms } : undefined),
  runFinish: (id: number, ms?: number) =>
    request<{ ok: true; finishMs: number }>('POST', `/api/match/competitors/${id}/run-finish`, ms != null ? { ms } : undefined),
  runSet: (id: number, data: { startMs?: number | null; finishMs?: number | null; status?: 'ok' | 'no_show' | 'dq' }) =>
    request<{ ok: true }>('POST', `/api/match/competitors/${id}/run`, data),

  // stage tablet
  stageEntries: (stageId: number) =>
    request<{ stageId: number; eventId: number; entries: StageEntryRow[] }>(
      'GET',
      `/api/match/stages/${stageId}/entries`,
    ),
  getStageEntry: (cid: number, sid: number) =>
    request<StageEntryDetail>('GET', `/api/match/competitors/${cid}/stages/${sid}`),
  saveStageEntry: (
    cid: number,
    sid: number,
    data: {
      rawTimeSeconds: number | null;
      waitTimeSeconds: number;
      status: 'ok' | 'no_show' | 'dq';
      penaltyCounts: Record<number, number>;
      bonusCounts: Record<number, number>;
    },
  ) => request<{ ok: true }>('POST', `/api/match/competitors/${cid}/stages/${sid}`, data),

  // obstacle tablet
  obstacleEntries: (obstacleId: number) =>
    request<{
      obstacleId: number;
      eventId: number;
      entries: Array<{
        competitorId: number;
        bib: string;
        firstName: string;
        lastName: string;
        divisionCode: string;
        matchStatus: Competitor['status'];
        scored: boolean;
      }>;
    }>('GET', `/api/match/obstacles/${obstacleId}/entries`),
  getObstacleEntry: (cid: number, oid: number) =>
    request<{
      competitor: Competitor;
      penaltyCounts: Record<string, number>;
      bonusCounts: Record<string, number>;
      penaltyTypes: PenType[];
      bonusTypes: BonType[];
    }>('GET', `/api/match/competitors/${cid}/obstacles/${oid}`),
  saveObstacleEntry: (
    cid: number,
    oid: number,
    data: {
      penaltyCounts: Record<number, number>;
      bonusCounts: Record<number, number>;
    },
  ) => request<{ ok: true }>('POST', `/api/match/competitors/${cid}/obstacles/${oid}`, data),

  // results
  results: (eventId: number) => request<ResultsResponse>('GET', `/api/match/events/${eventId}/results`),
};
