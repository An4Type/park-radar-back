-- User feedback no longer adjusts camera counts; it creates short-lived zones instead.
DROP TABLE "ParkingFeedback";
DROP TYPE "FeedbackAnswer";

CREATE TYPE "FreeLevel" AS ENUM ('NONE', 'FEW', 'MANY');

CREATE TABLE "ReportedZone" (
  "id" UUID NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "level" "FreeLevel" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ReportedZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReportedZone_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);

CREATE INDEX "ReportedZone_expiresAt_idx" ON "ReportedZone" ("expiresAt");
