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
