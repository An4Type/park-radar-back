CREATE TYPE "ParkingType" AS ENUM ('OUTDOOR', 'COVERED', 'UNDERGROUND');

ALTER TABLE "Parking"
  ADD COLUMN "disabledSpaces" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "evChargerSpaces" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "type" "ParkingType" NOT NULL DEFAULT 'OUTDOOR',
  ADD CONSTRAINT "Parking_special_spaces_check" CHECK ("disabledSpaces" >= 0 AND "disabledSpaces" <= "totalSpaces" AND "evChargerSpaces" >= 0 AND "evChargerSpaces" <= "totalSpaces");
