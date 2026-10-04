import { feedbackOccupiedDelta, freeSpaces, type Bbox, type CameraRecord, type FeedbackAnswer, type OccupancyReport, ParkingRecord } from '../../../packages/shared/src/parking.js';
import { prisma } from '../../../packages/database/src/client.js';

export interface ParkingRepository {
  list(bbox?: Bbox): Promise<ParkingRecord[]>;
  get(id: string): Promise<ParkingRecord | null>;
  ping(): Promise<void>;
  getCamera(id: string): Promise<CameraRecord | null>;
  /** Stores a worker result; returns null when the parking does not exist. */
  recordOccupancy(id: string, report: OccupancyReport): Promise<ParkingRecord | null>;
  /** Stores a user's answer and adjusts the occupancy estimate; returns null when the parking does not exist. */
  recordFeedback(id: string, answer: FeedbackAnswer): Promise<ParkingRecord | null>;
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
  async recordFeedback(id, answer) {
    return prisma.$transaction(async (tx) => {
      const parking = await tx.parking.findUnique({ where: { id } });
      if (!parking) return null;
      await tx.parkingFeedback.create({ data: { parkingId: id, answer, estimatedFreeSpaces: freeSpaces(parking.totalSpaces, parking.occupiedSpaces) } });
      // Single atomic UPDATE so concurrent answers don't overwrite each other; the count stays within 0..totalSpaces.
      await tx.$executeRaw`UPDATE "Parking" SET "occupiedSpaces" = LEAST("totalSpaces", GREATEST(0, "occupiedSpaces" + ${feedbackOccupiedDelta[answer]})), "updatedAt" = now() WHERE "id" = ${id}::uuid`;
      return tx.parking.findUnique({ where: { id } });
    });
  },
  async getCamera(id) { return (await prisma.camera.findUnique({ where: { id } })) as CameraRecord | null; },
  async ping() { await prisma.$queryRaw`SELECT 1`; },
};
