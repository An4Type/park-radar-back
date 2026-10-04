CREATE TYPE "FeedbackAnswer" AS ENUM ('CORRECT', 'LESS', 'MORE');

CREATE TABLE "ParkingFeedback" (
  "id" UUID NOT NULL,
  "parkingId" UUID NOT NULL,
  "answer" "FeedbackAnswer" NOT NULL,
  "estimatedFreeSpaces" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParkingFeedback_parkingId_fkey" FOREIGN KEY ("parkingId") REFERENCES "Parking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ParkingFeedback_parkingId_createdAt_idx" ON "ParkingFeedback" ("parkingId", "createdAt");
