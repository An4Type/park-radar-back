import type { Bbox, ParkingRecord } from '../../../packages/shared/src/parking.js';
import { prisma } from '../../../packages/database/src/client.js';

export interface ParkingRepository {
  list(bbox?: Bbox): Promise<ParkingRecord[]>;
  get(id: string): Promise<ParkingRecord | null>;
  ping(): Promise<void>;
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
  async ping() { await prisma.$queryRaw`SELECT 1`; },
};
