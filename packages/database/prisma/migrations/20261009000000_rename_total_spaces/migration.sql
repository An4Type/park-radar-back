-- totalSpaces now counts regular spaces only (disabled and EV charger spaces are separate pools).
ALTER TABLE "Parking" RENAME COLUMN "totalSpaces" TO "regularSpaces";
