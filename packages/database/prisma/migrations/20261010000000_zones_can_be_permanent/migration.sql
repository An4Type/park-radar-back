-- A null expiresAt means the zone never expires (used by seeded mock zones).
ALTER TABLE "ReportedZone" ALTER COLUMN "expiresAt" DROP NOT NULL;
