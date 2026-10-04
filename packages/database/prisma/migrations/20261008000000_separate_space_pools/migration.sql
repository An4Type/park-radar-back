-- totalSpaces used to include the disabled and EV charger spaces; from now on it counts regular spaces only.
-- The old combined occupiedSpaces cannot be split by type, so it is only capped to the new regular total.
ALTER TABLE "Parking"
  DROP CONSTRAINT "Parking_capacity_check",
  DROP CONSTRAINT "Parking_special_spaces_check",
  ADD COLUMN "occupiedDisabledSpaces" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "occupiedEvChargerSpaces" INTEGER NOT NULL DEFAULT 0;

UPDATE "Parking" SET "totalSpaces" = GREATEST("totalSpaces" - "disabledSpaces" - "evChargerSpaces", 0);
UPDATE "Parking" SET "occupiedSpaces" = LEAST("occupiedSpaces", "totalSpaces");

ALTER TABLE "Parking"
  ADD CONSTRAINT "Parking_capacity_check" CHECK (
    "totalSpaces" >= 0 AND "disabledSpaces" >= 0 AND "evChargerSpaces" >= 0
    AND "occupiedSpaces" BETWEEN 0 AND "totalSpaces"
    AND "occupiedDisabledSpaces" BETWEEN 0 AND "disabledSpaces"
    AND "occupiedEvChargerSpaces" BETWEEN 0 AND "evChargerSpaces"
  );
