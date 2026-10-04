export type ParkingType = 'OUTDOOR' | 'COVERED' | 'UNDERGROUND';

export type ParkingStatus = 'ACTIVE' | 'OFFLINE' | 'STREAM_ERROR' | 'RECOGNITION_ERROR' | 'DISABLED';

export interface ParkingRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  regularSpaces: number;
  disabledSpaces: number;
  evChargerSpaces: number;
  isPaid: boolean;
  type: ParkingType;
  occupiedSpaces: number;
  occupiedDisabledSpaces: number;
  occupiedEvChargerSpaces: number;
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

export function freeSpaces(regularSpaces: number, occupiedSpaces: number): number {
  return Math.max(regularSpaces - occupiedSpaces, 0);
}

export function parkingDto(parking: ParkingRecord, detailed = false) {
  const result = {
    id: parking.id,
    name: parking.name,
    address: parking.address,
    latitude: parking.latitude,
    longitude: parking.longitude,
    isPaid: parking.isPaid,
    type: parking.type,
    // Three separate pools, each as capacity plus free count (a capacity of 0 means the parking has none of that kind).
    regularSpaces: parking.regularSpaces,
    freeRegularSpaces: freeSpaces(parking.regularSpaces, parking.occupiedSpaces),
    disabledSpaces: parking.disabledSpaces,
    freeDisabledSpaces: freeSpaces(parking.disabledSpaces, parking.occupiedDisabledSpaces),
    evChargerSpaces: parking.evChargerSpaces,
    freeEvChargerSpaces: freeSpaces(parking.evChargerSpaces, parking.occupiedEvChargerSpaces),
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
  /** Cars in regular spaces; null when the camera does not see any. */
  occupiedSpaces: number | null;
  occupiedDisabledSpaces: number | null;
  occupiedEvChargerSpaces: number | null;
  confidence: number | null;
  recognizedAt: Date;
  data: Record<string, unknown> | null;
}

const reportStatuses: ParkingStatus[] = ['ACTIVE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'OFFLINE'];
const countFields = ['occupiedSpaces', 'occupiedDisabledSpaces', 'occupiedEvChargerSpaces'] as const;

export function parseOccupancyReport(body: unknown): OccupancyReport {
  const bad = (message: string) => new InputError('INVALID_REPORT', message);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Body must be a JSON object.');
  const { status, confidence = null, recognizedAt, data = null } = body as Record<string, unknown>;
  if (typeof status !== 'string' || !reportStatuses.includes(status as ParkingStatus)) throw bad(`status must be one of ${reportStatuses.join(', ')}.`);
  // A camera may only see some of the pools, so each count is optional; an ACTIVE report needs at least one.
  const counts = {} as Record<(typeof countFields)[number], number | null>;
  for (const field of countFields) {
    const value = (body as Record<string, unknown>)[field] ?? null;
    if (value !== null && !(Number.isInteger(value) && (value as number) >= 0)) throw bad(`${field} must be a non-negative integer.`);
    counts[field] = value as number | null;
  }
  if (status === 'ACTIVE' && countFields.every((field) => counts[field] === null)) throw bad('An ACTIVE report needs occupiedSpaces, occupiedDisabledSpaces or occupiedEvChargerSpaces.');
  if (confidence !== null && !(typeof confidence === 'number' && confidence >= 0 && confidence <= 1)) throw bad('confidence must be a number between 0 and 1.');
  const when = recognizedAt === undefined ? new Date() : new Date(recognizedAt as string);
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 60_000) throw bad('recognizedAt must be a valid, non-future timestamp.');
  if (data !== null && (typeof data !== 'object' || Array.isArray(data))) throw bad('data must be an object.');
  return { status: status as ParkingStatus, ...counts, confidence: confidence as number | null, recognizedAt: when, data: data as Record<string, unknown> | null };
}

export type FreeLevel = 'NONE' | 'FEW' | 'MANY';

const freeLevels: Record<string, FreeLevel> = { none: 'NONE', few: 'FEW', many: 'MANY' };

export interface ZoneInput {
  latitude: number;
  longitude: number;
  level: FreeLevel;
}

export interface ZoneRecord extends ZoneInput {
  id: string;
  createdAt: Date;
  /** null = never expires. */
  expiresAt: Date | null;
}

/** Accepts `{ "latitude": number, "longitude": number, "level": "none" | "few" | "many" }`. */
export function parseZone(body: unknown): ZoneInput {
  const bad = (message: string) => new InputError('INVALID_ZONE', message);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Body must be a JSON object.');
  const { latitude, longitude, level } = body as Record<string, unknown>;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw bad('latitude must be a number between -90 and 90.');
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw bad('longitude must be a number between -180 and 180.');
  const parsed = typeof level === 'string' ? freeLevels[level.toLowerCase()] : undefined;
  if (!parsed) throw bad(`level must be one of ${Object.keys(freeLevels).join(', ')}.`);
  return { latitude, longitude, level: parsed };
}

export const maxZoneLifespanMinutes = 24 * 60;

/** Optional `lifespan` in minutes (positive, at most 24 hours) from a zone report; returns seconds, or undefined when omitted. */
export function parseZoneLifespan(body: unknown): number | undefined {
  const { lifespan } = body as Record<string, unknown>;
  if (lifespan === undefined || lifespan === null) return undefined;
  if (typeof lifespan !== 'number' || !Number.isFinite(lifespan) || lifespan <= 0 || lifespan > maxZoneLifespanMinutes) {
    throw new InputError('INVALID_ZONE', `lifespan must be a number of minutes greater than 0 and at most ${maxZoneLifespanMinutes}.`);
  }
  return Math.round(lifespan * 60);
}

export function zoneDto(zone: ZoneRecord) {
  return { id: zone.id, latitude: zone.latitude, longitude: zone.longitude, level: zone.level };
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
