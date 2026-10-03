CREATE TYPE "MediaType" AS ENUM ('image', 'video', 'page');

CREATE TABLE "Camera" (
  "id" TEXT NOT NULL,
  "parkingId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "url" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "mediaType" "MediaType" NOT NULL DEFAULT 'image',
  "selector" TEXT,
  "readySelector" TEXT,
  "frameSelector" TEXT,
  "clickSelectors" JSONB NOT NULL DEFAULT '[]',
  "startPlayback" BOOLEAN NOT NULL DEFAULT true,
  "fullPage" BOOLEAN NOT NULL DEFAULT false,
  "viewportWidth" INTEGER NOT NULL DEFAULT 1280,
  "viewportHeight" INTEGER NOT NULL DEFAULT 720,
  "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "settleMs" INTEGER NOT NULL DEFAULT 1000,
  "attempts" INTEGER NOT NULL DEFAULT 2,
  "maxCaptures" INTEGER NOT NULL DEFAULT 288,
  "maxMediaAgeSeconds" INTEGER NOT NULL DEFAULT 900,
  "captureIntervalSeconds" INTEGER,
  "parkingAreas" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Camera_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Camera_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Camera_interval_check" CHECK ("captureIntervalSeconds" IS NULL OR "captureIntervalSeconds" BETWEEN 1 AND 86400)
);

CREATE INDEX "Camera_parkingId_idx" ON "Camera" ("parkingId");
