ALTER TABLE "QueueEntry"
ADD COLUMN "courtId" TEXT;

UPDATE "QueueEntry"
SET "courtId" = (
  SELECT "id"
  FROM "Court"
  ORDER BY "number" ASC
  LIMIT 1
)
WHERE "courtId" IS NULL;

ALTER TABLE "QueueEntry"
ALTER COLUMN "courtId" SET NOT NULL;

ALTER TABLE "QueueEntry"
ADD CONSTRAINT "QueueEntry_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE INDEX "QueueEntry_courtId_status_joinedAt_idx"
ON "QueueEntry"("courtId", "status", "joinedAt");
