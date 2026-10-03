import type { Bbox, CameraRecord, OccupancyReport, ParkingRecord } from '../../../packages/shared/src/parking.js';
import { prisma } from '../../../packages/database/src/client.js';

export interface ParkingRepository {
  list(bbox?: Bbox): Promise<ParkingRecord[]>;
  get(id: string): Promise<ParkingRecord | null>;
  ping(): Promise<void>;
  getCamera(id: string): Promise<CameraRecord | null>;
  /** Stores a worker result; returns null when the parking does not exist. */
  recordOccupancy(id: string, report: OccupancyReport): Promise<ParkingRecord | null>;
}

export const parkingRepository: ParkingRepository = {
  async list(bbox) {
    if (!bbox) return prisma.parking.findMany({ orderBy: { name: 'asc' } });
    return prisma.$queryRaw<ParkingRecord[]>`
      SELECT "id", "name", "address", "latitude", "longitude", "totalSpaces", "occupiedSpaces",
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
    const hasCount = report.status === 'ACTIVE' && report.occupiedSpaces !== null;
    return prisma.parking.update({
      where: { id },
      data: {
        status: report.status,
        // Failed reports keep the last known count rather than inventing one.
        ...(hasCount ? { occupiedSpaces: Math.min(report.occupiedSpaces as number, existing.totalSpaces), recognitionConfidence: report.confidence } : {}),
        recognitionData: (report.data ?? undefined) as object | undefined,
        lastRecognizedAt: report.recognizedAt,
      },
    });
  },
  async getCamera(id) { return (await prisma.camera.findUnique({ where: { id } })) as CameraRecord | null; },
  async ping() { await prisma.$queryRaw`SELECT 1`; },
};
