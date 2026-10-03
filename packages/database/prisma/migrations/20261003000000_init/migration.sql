CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TYPE "ParkingStatus" AS ENUM ('ACTIVE', 'OFFLINE', 'STREAM_ERROR', 'RECOGNITION_ERROR', 'DISABLED');

CREATE TABLE IF NOT EXISTS "Parking" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "totalSpaces" INTEGER NOT NULL,
  "occupiedSpaces" INTEGER NOT NULL DEFAULT 0,
  "status" "ParkingStatus" NOT NULL DEFAULT 'ACTIVE',
  "streamUrl" TEXT,
  "recognitionConfidence" DOUBLE PRECISION,
  "recognitionData" JSONB,
  "lastRecognizedAt" TIMESTAMPTZ(3),
  "workerId" TEXT,
  "workerLeaseUntil" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "location" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
  CONSTRAINT "Parking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Parking_capacity_check" CHECK ("totalSpaces" > 0 AND "occupiedSpaces" >= 0 AND "occupiedSpaces" <= "totalSpaces"),
  CONSTRAINT "Parking_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "Parking_confidence_check" CHECK ("recognitionConfidence" IS NULL OR "recognitionConfidence" BETWEEN 0 AND 1)
);

CREATE INDEX "Parking_status_workerLeaseUntil_idx" ON "Parking" ("status", "workerLeaseUntil");
CREATE INDEX "Parking_workerId_workerLeaseUntil_idx" ON "Parking" ("workerId", "workerLeaseUntil");
CREATE INDEX "Parking_location_gist_idx" ON "Parking" USING GIST ("location");
