export type ParkingStatus = 'ACTIVE' | 'OFFLINE' | 'STREAM_ERROR' | 'RECOGNITION_ERROR' | 'DISABLED';

export interface ParkingRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  totalSpaces: number;
  occupiedSpaces: number;
  status: ParkingStatus;
  recognitionConfidence: number | null;
  recognitionData: unknown | null;
  lastRecognizedAt: Date | null;
}

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export class InputError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function freeSpaces(totalSpaces: number, occupiedSpaces: number): number {
  return Math.max(totalSpaces - occupiedSpaces, 0);
}

export function parkingDto(parking: ParkingRecord, detailed = false) {
  const result = {
    id: parking.id,
    name: parking.name,
    address: parking.address,
    latitude: parking.latitude,
    longitude: parking.longitude,
    totalSpaces: parking.totalSpaces,
    occupiedSpaces: parking.occupiedSpaces,
    freeSpaces: freeSpaces(parking.totalSpaces, parking.occupiedSpaces),
    status: parking.status,
    confidence: parking.recognitionConfidence,
    lastUpdatedAt: parking.lastRecognizedAt?.toISOString() ?? null,
  };
  return detailed ? { ...result, recognitionData: parking.recognitionData } : result;
}

export function parseBbox(query: Record<string, unknown>): Bbox | undefined {
  const keys = ['minLon', 'minLat', 'maxLon', 'maxLat'] as const;
  if (keys.every((key) => query[key] === undefined)) return undefined;
  if (keys.some((key) => query[key] === undefined)) {
    throw new InputError('INVALID_BBOX', 'minLat, minLon, maxLat and maxLon are required.');
  }
  const values = Object.fromEntries(keys.map((key) => [key, Number(query[key])])) as unknown as Bbox;
  if (keys.some((key) => typeof query[key] !== 'string' || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(query[key] as string) || !Number.isFinite(values[key])) ||
      values.minLon < -180 || values.maxLon > 180 || values.minLat < -90 || values.maxLat > 90 ||
      values.minLon >= values.maxLon || values.minLat >= values.maxLat) {
    throw new InputError('INVALID_BBOX', 'BBOX must contain finite coordinates within valid ranges, with min values below max values.');
  }
  return values;
}

export interface OccupancyReport {
  status: ParkingStatus;
  occupiedSpaces: number | null;
  confidence: number | null;
  recognizedAt: Date;
  data: Record<string, unknown> | null;
}

const reportStatuses: ParkingStatus[] = ['ACTIVE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'OFFLINE'];

export function parseOccupancyReport(body: unknown): OccupancyReport {
  const bad = (message: string) => new InputError('INVALID_REPORT', message);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Body must be a JSON object.');
  const { status, occupiedSpaces = null, confidence = null, recognizedAt, data = null } = body as Record<string, unknown>;
  if (typeof status !== 'string' || !reportStatuses.includes(status as ParkingStatus)) throw bad(`status must be one of ${reportStatuses.join(', ')}.`);
  if (status === 'ACTIVE' && !(Number.isInteger(occupiedSpaces) && (occupiedSpaces as number) >= 0)) throw bad('occupiedSpaces must be a non-negative integer when status is ACTIVE.');
  if (occupiedSpaces !== null && !(Number.isInteger(occupiedSpaces) && (occupiedSpaces as number) >= 0)) throw bad('occupiedSpaces must be a non-negative integer.');
  if (confidence !== null && !(typeof confidence === 'number' && confidence >= 0 && confidence <= 1)) throw bad('confidence must be a number between 0 and 1.');
  const when = recognizedAt === undefined ? new Date() : new Date(recognizedAt as string);
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 60_000) throw bad('recognizedAt must be a valid, non-future timestamp.');
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw bad('data must be an object.');
  return { status: status as ParkingStatus, occupiedSpaces: occupiedSpaces as number | null, confidence: confidence as number | null, recognizedAt: when, data: data as Record<string, unknown> | null };
}

export type FeedbackAnswer = 'CORRECT' | 'LESS' | 'MORE';

const feedbackAnswers: Record<string, FeedbackAnswer> = { correct: 'CORRECT', less: 'LESS', more: 'MORE' };

// Every answer means one more car is taking a space (+1 occupied); "more" cancels that out, "less" adds one more.
export const feedbackOccupiedDelta: Record<FeedbackAnswer, number> = { CORRECT: 1, MORE: 0, LESS: 2 };

/** Accepts `{ "answer": "correct" | "less" | "more" }`. */
export function parseFeedback(body: unknown): FeedbackAnswer {
  const answer = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).answer : undefined;
  const parsed = typeof answer === 'string' ? feedbackAnswers[answer.toLowerCase()] : undefined;
  if (!parsed) throw new InputError('INVALID_FEEDBACK', `answer must be one of ${Object.keys(feedbackAnswers).join(', ')}.`);
  return parsed;
}

export interface CameraRecord {
  id: string;
  parkingId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  url: string;
  sourceUrl: string | null;
  mediaType: 'image' | 'video' | 'page';
  selector: string | null;
  readySelector: string | null;
  frameSelector: string | null;
  clickSelectors: unknown;
  startPlayback: boolean;
  fullPage: boolean;
  viewportWidth: number;
  viewportHeight: number;
  timeoutMs: number;
  settleMs: number;
  attempts: number;
  maxCaptures: number;
  maxMediaAgeSeconds: number;
  captureIntervalSeconds: number | null;
  parkingAreas: unknown;
}

// Shape the camera worker consumes: optional values are omitted, the viewport is nested.
export function cameraDto(camera: CameraRecord) {
  const { viewportWidth, viewportHeight, ...rest } = camera;
  const optional = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== null));
  return { ...optional, viewport: { width: viewportWidth, height: viewportHeight } };
}
