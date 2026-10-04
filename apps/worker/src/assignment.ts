import { prisma } from '../../../packages/database/src/client.js';
import type { ParkingStatus } from '../../../packages/shared/src/parking.js';
import { Prisma } from '../../../packages/database/generated/prisma/client.js';

export interface ClaimedParking {
  id: string;
  regularSpaces: number;
  streamUrl: string | null;
}

export async function claimParking(workerId: string, leaseSeconds: number): Promise<ClaimedParking | null> {
  const rows = await prisma.$queryRaw<Array<ClaimedParking>>`
    WITH candidate AS (
      SELECT "id" FROM "Parking"
      WHERE "status" <> 'DISABLED' AND ("workerLeaseUntil" IS NULL OR "workerLeaseUntil" < NOW())
      ORDER BY "lastRecognizedAt" ASC NULLS FIRST, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "Parking" AS p
    SET "workerId" = ${workerId},
        "workerLeaseUntil" = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
        "updatedAt" = NOW()
    FROM candidate
    WHERE p."id" = candidate."id"
    RETURNING p."id", p."regularSpaces", p."streamUrl"
  `;
  return rows[0] ?? null;
}

export async function renewLease(parkingId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
  const result = await prisma.parking.updateMany({
    where: { id: parkingId, workerId, workerLeaseUntil: { gt: new Date() }, status: { not: 'DISABLED' } },
    data: { workerLeaseUntil: new Date(Date.now() + leaseSeconds * 1000) },
  });
  return result.count === 1;
}

export async function saveRecognition(parkingId: string, workerId: string, occupiedSpaces: number, confidence: number | undefined, metadata: Record<string, unknown> | undefined): Promise<boolean> {
  const result = await prisma.parking.updateMany({
    where: { id: parkingId, workerId, workerLeaseUntil: { gt: new Date() }, status: { not: 'DISABLED' } },
    data: {
      occupiedSpaces,
      recognitionConfidence: confidence ?? null,
      recognitionData: (metadata ?? {}) as Prisma.InputJsonValue,
      lastRecognizedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  return result.count === 1;
}

export async function setFailureStatus(parkingId: string, workerId: string, status: Extract<ParkingStatus, 'STREAM_ERROR' | 'RECOGNITION_ERROR'>): Promise<boolean> {
  const result = await prisma.parking.updateMany({
    where: { id: parkingId, workerId, workerLeaseUntil: { gt: new Date() }, status: { not: 'DISABLED' } },
    data: { status },
  });
  return result.count === 1;
}

export async function releaseParking(parkingId: string, workerId: string): Promise<void> {
  await prisma.parking.updateMany({
    where: { id: parkingId, workerId },
    data: { workerId: null, workerLeaseUntil: null },
  });
}
