import type { Bbox, CameraRecord, OccupancyReport, ParkingRecord, ZoneInput, ZoneRecord } from '../../../packages/shared/src/parking.js';
import { prisma } from '../../../packages/database/src/client.js';

export interface ParkingRepository {
  list(bbox?: Bbox): Promise<ParkingRecord[]>;
  get(id: string): Promise<ParkingRecord | null>;
  ping(): Promise<void>;
  getCamera(id: string): Promise<CameraRecord | null>;
  /** Stores a worker result; returns null when the parking does not exist. */
  recordOccupancy(id: string, report: OccupancyReport): Promise<ParkingRecord | null>;
  /** Zones that have not expired yet, optionally within a bounding box. */
  listZones(bbox?: Bbox): Promise<ZoneRecord[]>;
  /**
   * Stores a user-reported zone that stays visible for `ttlSeconds`. A report within `mergeMeters` of an active zone
   * updates that zone's level and expiry instead (its position is kept) and returns `created: false`.
   */
  createZone(input: ZoneInput, options: { ttlSeconds: number; mergeMeters: number }): Promise<{ zone: ZoneRecord; created: boolean }>;
}

export const parkingRepository: ParkingRepository = {
  async list(bbox) {
    if (!bbox) return prisma.parking.findMany({ orderBy: { name: 'asc' } });
    return prisma.$queryRaw<ParkingRecord[]>`
      SELECT "id", "name", "address", "latitude", "longitude", "regularSpaces", "disabledSpaces", "evChargerSpaces", "isPaid", "type", "occupiedSpaces", "occupiedDisabledSpaces", "occupiedEvChargerSpaces",
             "status", "recognitionConfidence", "recognitionData", "lastRecognizedAt"
      FROM "Parking"
      WHERE "location" && ST_MakeEnvelope(${bbox.minLon}, ${bbox.minLat}, ${bbox.maxLon}, ${bbox.maxLat}, 4326)
      ORDER BY "name" ASC
    `;
  },
  get(id) { return prisma.parking.findUnique({ where: { id } }); },
  async recordOccupancy(id, report) {
    const existing = await prisma.parking.findUnique({ where: { id } });
    if (!existing) return null;
    // Ignore results older than what is stored so late or retried reports never overwrite newer data.
    if (existing.lastRecognizedAt && report.recognizedAt < existing.lastRecognizedAt) return existing;
    const counted = report.status === 'ACTIVE';
    // Each pool is updated only when the report carries its count, and never above that pool's capacity.
    const count = (value: number | null, capacity: number) => (counted && value !== null ? Math.min(value, capacity) : undefined);
    return prisma.parking.update({
      where: { id },
      data: {
        status: report.status,
        // Failed reports keep the last known count rather than inventing one.
        occupiedSpaces: count(report.occupiedSpaces, existing.regularSpaces),
        occupiedDisabledSpaces: count(report.occupiedDisabledSpaces, existing.disabledSpaces),
        occupiedEvChargerSpaces: count(report.occupiedEvChargerSpaces, existing.evChargerSpaces),
        ...(counted ? { recognitionConfidence: report.confidence } : {}),
        recognitionData: (report.data ?? undefined) as object | undefined,
        lastRecognizedAt: report.recognizedAt,
      },
    });
  },
  async listZones(bbox) {
    const now = new Date();
    return prisma.reportedZone.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(bbox ? { latitude: { gte: bbox.minLat, lte: bbox.maxLat }, longitude: { gte: bbox.minLon, lte: bbox.maxLon } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  },
  async createZone(input, { ttlSeconds, mergeMeters }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    return prisma.$transaction(async (tx) => {
      // Serialize reports so two simultaneous nearby ones cannot both miss each other and create duplicates.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ReportedZone'))`;
      // Expired zones are only hidden by listZones; clean them up as new ones arrive.
      await tx.reportedZone.deleteMany({ where: { expiresAt: { lte: now } } });
      const [nearest] = await tx.$queryRaw<{ id: string; expiresAt: Date | null }[]>`
        SELECT "id", "expiresAt" FROM "ReportedZone"
        WHERE ST_DWithin(ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography, ${mergeMeters})
        ORDER BY ST_Distance(ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography, ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography) ASC
        LIMIT 1
      `;
      if (nearest) return { zone: await tx.reportedZone.update({ where: { id: nearest.id }, data: { level: input.level, ...(nearest.expiresAt ? { expiresAt } : {}) } }), created: false };
      return { zone: await tx.reportedZone.create({ data: { ...input, expiresAt } }), created: true };
    });
  },
  async getCamera(id) { return (await prisma.camera.findUnique({ where: { id } })) as CameraRecord | null; },
  async ping() { await prisma.$queryRaw`SELECT 1`; },
};
